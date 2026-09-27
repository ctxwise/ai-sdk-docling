import { createHash } from 'node:crypto';
import type { DoclingDocument, DoclingItem } from './docling.ts';

/** LLM-ready content in reading order. Text never contains base64; pictures are separate image blocks. */
export type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; base64: string; cls?: string };

export interface BlockOptions {
  /** pictures sent as images per document; the rest become a text stub */
  maxImages?: number;
  /** picture classes not worth vision tokens */
  skipClasses?: readonly string[];
  /** drop pictures smaller than this on either side (px) */
  minImagePx?: number;
  /** only items on this page (1-based) */
  page?: number;
  /** text docling read inside a chart/diagram/table image, sent next to it (exact labels and values); 0 = off */
  pictureTextChars?: number;
}

// picture classes (docling figure classifier v2.5) that carry information the model must read precisely
const INFO = new Set([
  'bar_chart', 'line_chart', 'pie_chart', 'scatter_plot', 'box_plot', 'flow_chart', 'table', 'engineering_drawing',
  'chemistry_structure', 'geographical_map', 'topographical_map', 'screenshot_from_computer', 'screenshot_from_manual',
]);
/** pictures where OCR text is noise and fine detail matters least */
export const PHOTO = new Set(['photograph', 'signature', 'stamp']);

/** defaults for the block and page options (the middleware's DEFAULTS include these) */
export const BLOCK_DEFAULTS = {
  maxImages: 10,
  skipClasses: ['logo', 'icon'] as readonly string[],
  minImagePx: 48,
  pictureTextChars: 600,
  denseChars: 3000,
  maxPageImages: 20,
};

/** scores are shown rounded down, so 0.796 reads 0.79 and never looks like it passed a 0.8 threshold */
export const fmtScore = (s: number) => (Math.floor(s * 100) / 100).toFixed(2);

/** "data:image/png;base64,..." -> its media type and base64 payload */
const dataUri = (uri: string | undefined) =>
  uri?.startsWith('data:') ? { mediaType: uri.slice(5, uri.indexOf(';')), base64: uri.slice(uri.indexOf(',') + 1) } : undefined;

/**
 * Docling's text for one page, plus the hint (if any) to send next to the page image.
 * Rule measured on OmniDocBench hard pages: the image alone wins on handwriting, tables and layout, but
 * vision can't read dense small print -> full docling text as a hint on dense pages without tables.
 * Tried and rejected: a tables-removed hint on table pages (model dropped the tables: TEDS 86 -> 59).
 */
export function pageText(doc: DoclingDocument, page: number, denseChars = BLOCK_DEFAULTS.denseChars, opts: BlockOptions = {}) {
  const text = doclingToBlocks(doc, { ...opts, page, maxImages: 0 })
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n');
  const hasTable = (doc.tables ?? []).some((t) => t.content_layer === 'body' && t.prov?.[0]?.page_no === page);
  const hint = text.length > denseChars && !hasTable
    ? `Text extracted by a layout parser (reading order may be wrong; the image is the ground truth):\n<parser>\n${text}\n</parser>`
    : undefined;
  return { text, hint };
}

/** Walk a DoclingDocument (docling-serve `json_content`) into compact text + image blocks. */
export function doclingToBlocks(doc: DoclingDocument, opts: BlockOptions = {}): Block[] {
  const { maxImages = BLOCK_DEFAULTS.maxImages, skipClasses = BLOCK_DEFAULTS.skipClasses, minImagePx = BLOCK_DEFAULTS.minImagePx,
    pictureTextChars = BLOCK_DEFAULTS.pictureTextChars, page } = opts;
  const out: Block[] = [];
  const seen = new Set<string>();
  let images = 0;

  const get = (ref: string): DoclingItem | undefined => {
    const [, kind, i] = ref.split('/'); // "#/texts/12"
    return (doc[kind as 'texts'] as DoclingItem[] | undefined)?.[Number(i)];
  };
  // ￿ = ligature docling could not map (e.g. "A￿liation"); collapse runs of spaces
  const clean = (s: string | undefined) => (s ?? '').replace(/￿/g, '�').replace(/[ \t]+/g, ' ').trim();
  const onPage = (it: DoclingItem | undefined) => !page || it?.prov?.[0]?.page_no === page;
  const captionOf = (it: Pick<DoclingItem, 'captions'>) => (it.captions ?? []).map((c) => clean(get(c.$ref)?.text)).filter(Boolean).join(' ');
  const push = (s: string) => {
    if (!s) return;
    const last = out.at(-1);
    if (last?.type === 'text') last.text += '\n\n' + s;
    else out.push({ type: 'text', text: s });
  };

  function table(t: Pick<DoclingItem, 'data' | 'captions'>): string {
    const grid = t.data?.grid ?? [];
    if (!grid.length) return '';
    // leading header rows (spanning headers repeat per column) -> one header row "group / sub"
    // a row is header if most of its cells are flagged (the model often misses the corner cell)
    const isHeader = (r: (typeof grid)[number]) => {
      const filled = r.filter((c) => c.text);
      return filled.length > 0 && filled.filter((c) => c.column_header).length * 2 >= filled.length;
    };
    let h = 0;
    while (h < grid.length - 1 && isHeader(grid[h])) h++;
    h = Math.max(h, 1);
    const cols = grid[0].length;
    const head = Array.from({ length: cols }, (_, c) =>
      [...new Set(grid.slice(0, h).map((r) => clean(r[c]?.text)).filter(Boolean))].join(' / '),
    );
    const row = (cells: string[]) => `|${cells.map((c) => c.replace(/\|/g, '\\|').replace(/\n/g, ' ')).join('|')}|`;
    const lines = [row(head), `|${'-|'.repeat(cols)}`, ...grid.slice(h).map((r) => row(r.map((c) => clean(c.text))))];
    const cap = captionOf(t);
    return (cap ? cap + '\n' : '') + lines.join('\n');
  }

  function list(g: DoclingItem, depth: number): string {
    return (g.children ?? [])
      .map((c, i) => {
        const it = get(c.$ref);
        if (!it || it.content_layer !== 'body') return '';
        if (it.label === 'list' || it.label === 'ordered_list') return list(it, depth + 1);
        if (!onPage(it)) return '';
        const bullet = it.enumerated ? `${i + 1}.` : '-';
        const nested = (it.children ?? []).map((k) => get(k.$ref)).filter((k) => k?.label === 'list') as DoclingItem[];
        return [`${'  '.repeat(depth)}${bullet} ${clean(it.text)}`, ...nested.map((k) => list(k, depth + 1))].join('\n');
      })
      .filter(Boolean)
      .join('\n');
  }

  const classOf = (p: DoclingItem): string | undefined => p.meta?.classification?.predictions?.[0]?.class_name;
  const b64Of = (p: DoclingItem): string => dataUri(p.image?.uri)?.base64 ?? '';
  const sendable = (p: DoclingItem) => {
    const s = p.image?.size;
    const cls = classOf(p);
    return p.content_layer === 'body' && onPage(p) && !!b64Of(p) && !(cls && skipClasses.includes(cls)) &&
      !(s && (s.width < minImagePx || s.height < minImagePx));
  };
  const captionDoclingRefs = new Set<string>(
    [...(doc.pictures ?? []), ...(doc.tables ?? [])].flatMap((x) => (x.captions ?? []).map((c) => c.$ref)),
  );
  // which pictures fit under maxImages: charts/diagrams/tables first, photos last, bigger first; duplicates once
  const chosen = new Set<string>();
  {
    const rank = (cls?: string) => (cls && INFO.has(cls) ? 0 : cls && PHOTO.has(cls) ? 2 : 1);
    const area = (p: DoclingItem) => (p.image?.size?.width ?? 0) * (p.image?.size?.height ?? 0);
    const hashes = new Set<string>();
    const unique = (doc.pictures ?? []).filter((p) => {
      if (!sendable(p)) return false;
      const h = createHash('sha1').update(b64Of(p)).digest('hex');
      return !hashes.has(h) && !!hashes.add(h);
    });
    unique.sort((a, b) => rank(classOf(a)) - rank(classOf(b)) || area(b) - area(a));
    unique.slice(0, maxImages).forEach((p) => chosen.add(p.self_ref));
  }

  function picture(p: DoclingItem) {
    const cls = classOf(p);
    if (cls && skipClasses.includes(cls)) return; // decorative: nothing worth saying either
    const cap = captionOf(p);
    const desc = `${cls ? ` (${cls.replace(/_/g, ' ')})` : ''}${cap ? `: ${cap}` : ''}`;
    // text docling read inside the picture (axis labels, values, box labels); capped, never for photos
    let inner = (p.children ?? [])
      .filter((c) => !(p.captions ?? []).some((k) => k.$ref === c.$ref))
      .map((c) => clean(get(c.$ref)?.text))
      .filter(Boolean)
      .join(' | ');
    if (inner.length > pictureTextChars) inner = inner.slice(0, pictureTextChars).replace(/\s*\|?\s*\S*$/, '') + ' ...';
    const innerNote = inner && pictureTextChars > 0 && !(cls && PHOTO.has(cls)) ? ` | text in image: ${inner}` : '';
    const b64 = b64Of(p);
    // charts stored as data (PowerPoint/Excel): docling reads the values -> exact table, no image needed
    const chartData = p.meta?.tabular_chart?.chart_data;
    const chart = chartData?.grid?.length ? table({ data: chartData }) : '';
    if (!b64 && chart) return push(`[chart${desc}]\n${chart}`);
    const hash = b64 && createHash('sha1').update(b64).digest('hex');
    if (hash && seen.has(hash)) return push(`[repeated image${desc}]`);
    if (!chosen.has(p.self_ref)) return push(`[image not shown${desc}${innerNote}]${chart ? '\n' + chart : ''}`);
    if (hash) seen.add(hash);
    images++;
    push(`[image ${images}${desc}${innerNote}]${chart ? '\n' + chart : ''}`);
    out.push({ type: 'image', mediaType: p.image?.mimetype ?? 'image/png', base64: b64, ...(cls && { cls }) });
  }

  function walk(ref: string) {
    const it = get(ref);
    if (!it) return;
    // speaker notes (PowerPoint) are their own layer; furniture = page headers/footers, skipped
    if (it.content_layer === 'notes') return push(`Notes: ${clean(it.text)}`);
    if (it.content_layer !== 'body') return;
    const kind = ref.split('/')[1];
    if (kind !== 'groups' && !onPage(it)) return;
    if (kind === 'pictures') return picture(it); // its children are caption / text inside the image
    if (kind === 'tables') return push(table(it));
    if (kind === 'groups') {
      // sheet names (Excel) and slide numbers (PowerPoint) so the model can refer to them
      if (it.label === 'sheet' && it.name) push(`## Sheet: ${clean(it.name)}`);
      const slide = it.label === 'chapter' && /^slide-(\d+)$/.exec(it.name ?? '');
      if (slide) push(`[slide ${Number(slide[1]) + 1}]`);
      if (it.label === 'list' || it.label === 'ordered_list') return push(list(it, 0));
      if (it.label === 'inline') return push((it.children ?? []).map((c) => get(c.$ref)).filter(onPage).map((t) => clean(t?.text)).join(' '));
      return (it.children ?? []).forEach((c) => walk(c.$ref));
    }
    // texts; a caption already printed with its picture/table isn't repeated (Excel lists it twice)
    if (captionDoclingRefs.has(ref)) return;
    const text = clean(it.text);
    switch (it.label) {
      case 'title': push(`# ${text}`); break;
      case 'section_header': push(`${'#'.repeat(Math.min((it.level ?? 1) + 1, 6))} ${text}`); break;
      case 'code': push('```\n' + (it.text ?? '').trim() + '\n```'); break;
      case 'formula': push(text ? `$$${text}$$` : '[formula]'); break;
      case 'list_item': push(`- ${text}`); break;
      default: push(text);
    }
    (it.children ?? []).forEach((c) => walk(c.$ref));
  }

  // Word page header/footer (e.g. "Confidential") once; in PDFs furniture is per-page noise, so skipped there
  if (!page && /wordprocessingml|msword/.test(doc.origin?.mimetype ?? '')) {
    const hf = [...new Set((doc.texts ?? []).filter((t) => t.content_layer === 'furniture').map((t) => clean(t.text)).filter(Boolean))];
    if (hf.length) push(`Page header/footer: ${hf.join(' | ')}`);
  }
  (doc.body?.children ?? []).forEach((c) => walk(c.$ref));
  return out;
}

export interface PageBlockOptions extends BlockOptions {
  /** page text length above which docling's text is sent next to the page image (benchmarked: 2500-6000 all similar) */
  denseChars?: number;
  /** pages beyond this many images are sent as docling text only (caps vision tokens on long documents) */
  maxPageImages?: number;
  /** pages to send as images; the others as docling text + pictures. Default: every page */
  imagePages?: ReadonlySet<number>;
  /** per-page confidence, shown on each page marker */
  scores?: ReadonlyMap<number, number>;
  /** the original image file, sent instead of docling's re-render (single-image documents) */
  original?: { mediaType: string; base64: string };
}

/**
 * Page by page: each image page as the rendered page (+ docling text as a hint where pageText says so),
 * every other page as docling text + pictures. Needs docling's page images (`include_page_images`).
 */
export function pageBlocks(doc: DoclingDocument, opts: PageBlockOptions = {}): Block[] {
  const { denseChars = BLOCK_DEFAULTS.denseChars, maxPageImages = BLOCK_DEFAULTS.maxPageImages, imagePages, scores, original } = opts;
  const nums = Object.keys(doc.pages ?? {}).map(Number).sort((a, b) => a - b);
  if (!nums.length && original) return [{ type: 'image', ...original }];
  let images = 0;
  return nums.flatMap((n): Block[] => {
    const s = scores?.get(n);
    const out: Block[] = nums.length > 1 ? [{ type: 'text', text: `[page ${n}${s === undefined ? '' : `, confidence ${fmtScore(s)}`}]` }] : [];
    if (imagePages && !imagePages.has(n)) return [...out, ...doclingToBlocks(doc, { ...opts, page: n })];
    const { text, hint } = pageText(doc, n, denseChars, opts);
    const image = images < maxPageImages ? (original ?? dataUri(doc.pages?.[n]?.image?.uri)) : undefined;
    if (!image) return text ? [...out, { type: 'text', text }] : out; // docling text is all the model gets
    images++;
    return [...out, ...(hint ? [{ type: 'text' as const, text: hint }] : []), { type: 'image', ...image }];
  });
}
