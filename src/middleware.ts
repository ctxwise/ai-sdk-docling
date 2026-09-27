import { createHash } from 'node:crypto';
import type { LanguageModelV4FilePart, LanguageModelV4Middleware, LanguageModelV4TextPart } from '@ai-sdk/provider';
import { generateText, type Experimental_DownloadFunction, type LanguageModel } from 'ai';
import { BLOCK_DEFAULTS, doclingToBlocks, fmtScore, pageBlocks, PHOTO, type Block, type BlockOptions } from './blocks.ts';
import { PromiseCache } from './cache.ts';
import { convertWithDocling } from './docling.ts';
import { DOCLING_TYPES, isPlainTextType, OPENAI_NATIVE_TYPES, safeName } from './media.ts';

type Part = LanguageModelV4TextPart | LanguageModelV4FilePart;
type Mode = 'native' | 'docling' | 'pages';

export interface DoclingAttachmentsOptions extends Omit<BlockOptions, 'page'> {
  /** docling-serve base url, e.g. http://localhost:5001 */
  url: string;
  /** docling-serve API key (DOCLING_SERVE_API_KEY on the server) */
  apiKey?: string;

  /**
   * How PDFs reach the model.
   * - 'docling': docling text + extracted pictures; pages below `minConfidence` go to the model as page images.
   * - 'pages': each page as an image, plus docling's text as a hint on dense pages without tables. Most tokens.
   * - 'native': the provider reads the PDF itself. No docling, no wait.
   * @default 'docling'
   */
  pdf?: Mode;
  /**
   * How images reach the model.
   * - 'docling': docling text (+ crops of real pictures inside the image); the image itself only when docling's
   *   confidence < `minConfidence`.
   * - 'pages': always the image, plus docling text as a hint on dense pages.
   * - 'native': images pass through unchanged.
   * @default 'docling'
   */
  images?: Mode;
  /**
   * Pages whose docling confidence (low_score, 0-1, covers OCR + layout) is below this go to the model as images.
   * The score is shown to the model: `<document name=".." confidence="0.86">`. 0 = off.
   * @default 0.8
   */
  minConfidence?: number;
  /** page text length above which docling's text is sent next to a page image. @default 3000 */
  denseChars?: number;
  /** page images per document; later pages are sent as docling text only. @default 20 */
  maxPageImages?: number;
  /** OpenAI image detail for photos, signatures and stamps; charts, tables and pages always keep full detail. @default 'low' */
  imageDetail?: 'low' | 'high' | 'auto';

  /** larger files are not parsed (images/PDFs pass through, other files get a note). @default 52428800 (50 MB) */
  maxFileBytes?: number;
  /** only the first N pages of a document are parsed; the model is told when it was cut. @default 100 */
  maxPages?: number;
  /** plain-text attachments longer than this are cut, with a note. @default 200000 */
  maxTextChars?: number;
  /** deadline for one document, including docling's queue. @default 900000 (15 min) */
  timeoutMs?: number;
  /** memory for parsed documents; chat history re-sends the same files every turn. @default 256 */
  cacheMB?: number;

  /** media types the model accepts as file parts as-is. @default OPENAI_NATIVE_TYPES */
  nativeTypes?: readonly string[];
  /** media types docling parses -> file extension. Add or remove entries to change what is parsed. @default DOCLING_TYPES */
  doclingTypes?: Readonly<Record<string, string>>;
  /** media types read as plain text, no parser. @default isPlainTextType (text/*, json, xml, yaml, code) */
  plainTextTypes?: (mediaType: string) => boolean;
  /** extra docling-serve convert options (e.g. `{ ocr_lang: ['en', 'de'] }`); override the middleware's own */
  doclingOptions?: Record<string, string | string[]>;

  /**
   * Download http(s) file URLs on this server. Off by default: a URL in a user message would otherwise make
   * this server fetch arbitrary addresses (SSRF). Off = URL parts pass through for the provider to handle.
   * @default false
   */
  fetchUrls?: boolean;
  /**
   * Optional vision model (e.g. openai('gpt-5-mini')). Every image and fallback PDF is first turned into text by
   * this model, so the main model gets text only. Weaker models read much worse: gpt-5-nano measured 3x the
   * text error of gpt-5-mini.
   */
  visionModel?: LanguageModel;
  /** instruction for `visionModel` */
  visionPrompt?: string;
  /** called with errors that were turned into a note or a passthrough. @default console.warn */
  onError?: (error: unknown, filename: string) => void;
}

/** Every option's default, for reference or to derive your own values (e.g. `DEFAULTS.maxPages * 2`). */
export const DEFAULTS = {
  ...BLOCK_DEFAULTS,
  pdf: 'docling',
  images: 'docling',
  minConfidence: 0.8,
  imageDetail: 'low',
  maxFileBytes: 50 * 2 ** 20,
  maxPages: 100,
  maxTextChars: 200_000,
  timeoutMs: 900_000,
  cacheMB: 256,
  nativeTypes: OPENAI_NATIVE_TYPES,
  doclingTypes: DOCLING_TYPES,
  plainTextTypes: isPlainTextType,
  fetchUrls: false,
  visionPrompt:
    'Convert this image to text for another AI that cannot see it. Transcribe all text exactly, including handwriting; ' +
    'tables as Markdown with exact numbers. For charts: the chart type, axis labels and every data value. ' +
    'For photos and illustrations: a concise factual description. Output only the content, no preamble.',
} as const satisfies Partial<DoclingAttachmentsOptions>;

/**
 * Pass as `experimental_download` to streamText/generateText. The AI SDK otherwise downloads URL file parts
 * the model doesn't accept by URL - from your server, to any address a user puts in a message (SSRF).
 * With this, nothing is downloaded server-side; URL parts go to the provider unchanged.
 */
export const noServerDownloads: Experimental_DownloadFunction = async (files) => files.map(() => null);

/** error whose message is safe to show the model; anything else is logged and reported generically */
class AttachmentError extends Error {}

const PDF = 'application/pdf';
const isImage = (t: string) => t.startsWith('image/');
const sha256 = (...data: (string | Uint8Array)[]) => data.reduce((h, d) => h.update(d), createHash('sha256')).digest('hex');

/** merges adjacent text parts (fewer parts, same content); copies them so cached parts are never mutated */
function mergeText(parts: Part[]): Part[] {
  return parts.reduce<Part[]>((acc, p) => {
    const last = acc.at(-1);
    if (p.type === 'text' && last?.type === 'text') last.text += '\n' + p.text;
    else acc.push(p.type === 'text' ? { ...p } : p);
    return acc;
  }, []);
}

/** AI SDK middleware: every attachment in a user message becomes something the model can read. */
export function doclingAttachments(options: DoclingAttachmentsOptions): LanguageModelV4Middleware {
  if (!options.url) throw new TypeError('doclingAttachments: `url` (the docling-serve address) is required');
  // explicit `undefined` (e.g. from an unset env var) keeps the default
  const opts = { ...DEFAULTS, ...(Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) as DoclingAttachmentsOptions) };
  const { url, apiKey, pdf, images, minConfidence, imageDetail, maxFileBytes, maxPages, maxTextChars, timeoutMs } = opts;
  const { doclingTypes, plainTextTypes, fetchUrls, visionModel, visionPrompt } = opts;
  const onError = opts.onError ?? ((e, name) => console.warn(`[ai-sdk-docling] ${name}:`, e));
  const native = new Set(opts.nativeTypes);
  const name = (p: LanguageModelV4FilePart) => safeName(p.filename, p.mediaType, doclingTypes);

  // ponytail: in-process caches; move to Redis/blob keyed by the same sha256 when running >1 instance
  const parsedCache = new PromiseCache<Part[]>(opts.cacheMB * 2 ** 20, (parts) =>
    parts.reduce((n, p) => {
      const d = p.type === 'text' ? p.text : p.data.type === 'data' ? p.data.data : '';
      return n + (typeof d === 'string' ? d.length : d.byteLength);
    }, 0));
  const visionCache = new PromiseCache<string>(1000); // vision text is small: an entry count is enough

  // PDFs/images go through docling when a mode asks for it, or always when the model can't take them
  const viaDocling = (t: string) =>
    !!doclingTypes[t] && (!native.has(t) || (t === PDF && pdf !== 'native') || (isImage(t) && images !== 'native'));
  // images the model can't take (tiff, bmp) are always sent as rendered page images
  const pageMode = (t: string) => (t === PDF && pdf === 'pages') || (isImage(t) && (images === 'pages' || !native.has(t)));

  /** file bytes, or null when the part should be left for the provider (remote URL / provider reference) */
  async function bytesOf(part: LanguageModelV4FilePart): Promise<Buffer | null> {
    const d = part.data;
    let bytes: Buffer | null = null;
    if (d.type === 'data') bytes = typeof d.data === 'string' ? Buffer.from(d.data, 'base64') : Buffer.from(d.data);
    else if (d.type === 'text') bytes = Buffer.from(d.text, 'utf8');
    else if (d.type === 'url' && d.url.protocol === 'data:') bytes = Buffer.from(d.url.href.slice(d.url.href.indexOf(',') + 1), 'base64');
    else if (d.type === 'url' && fetchUrls && /^https?:$/.test(d.url.protocol)) {
      const r = await fetch(d.url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) throw new Error(`download ${d.url} -> HTTP ${r.status}`);
      if (Number(r.headers.get('content-length')) > maxFileBytes) throw new AttachmentError('the file is too large to read');
      bytes = Buffer.from(await r.arrayBuffer());
    }
    if (bytes && bytes.length > maxFileBytes) {
      throw new AttachmentError(`the file is too large to read (${(bytes.length / 2 ** 20).toFixed(0)} MB, limit ${(maxFileBytes / 2 ** 20).toFixed(0)} MB)`);
    }
    return bytes;
  }

  async function convert(bytes: Buffer, filename: string, mediaType: string): Promise<Part[]> {
    const image = isImage(mediaType);
    let pages = pageMode(mediaType);
    const fallback = !pages && (mediaType === PDF || image) && minConfidence > 0;
    // page mode renders pages (except a native image, sent as-is); the PDF fallback needs renders of low pages
    const needsPageImages = (pages && !(image && native.has(mediaType))) || (fallback && !image);
    const { doc, pageScores, score } = await convertWithDocling(bytes, filename, {
      url, apiKey, timeoutMs,
      options: {
        to_formats: 'json',
        image_export_mode: 'embedded',
        // ONNX PP-OCR: lighter/faster than easyocr; pinned so an upstream default change can't swap engines silently
        ocr_preset: 'rapidocr',
        page_range: ['1', String(maxPages)],
        // page mode sends whole pages: no picture crops; the fallback needs page images for low pages (PDFs)
        ...(pages ? { include_images: 'false' } : { do_picture_classification: 'true' }),
        ...(needsPageImages && { include_page_images: 'true' }),
        ...opts.doclingOptions,
      },
    });

    const open = { type: 'text' as const, text: `<document name="${filename}"${score === undefined ? '' : ` confidence="${fmtScore(score)}"`}>` };
    const close = { type: 'text' as const, text: '</document>' };
    const lowPages = [...pageScores].filter(([, s]) => s < minConfidence).map(([n]) => n);
    const empty = !(doc.texts?.length || doc.pictures?.length || doc.tables?.length);
    let blocks: Block[] | undefined;
    if (fallback && !image && lowPages.length && lowPages.length < pageScores.size) {
      // some pages low: docling text for the confident pages, page images only for the low ones
      blocks = pageBlocks(doc, { ...opts, imagePages: new Set(lowPages), scores: pageScores });
    } else if ((fallback && (score ?? 1) < minConfidence) || (empty && (image || mediaType === PDF))) {
      // low confidence, or nothing extracted: the model reads the original (PDF: its own text layer + page images)
      if (native.has(mediaType) && !image) return [open, { type: 'file', mediaType, filename, data: { type: 'data', data: bytes } }, close];
      pages = true;
    }
    const original = image && native.has(mediaType) ? { mediaType, base64: bytes.toString('base64') } : undefined;
    blocks ??= pages ? pageBlocks(doc, { ...opts, original }) : doclingToBlocks(doc, opts);
    const cut = !image && Object.keys(doc.pages ?? {}).length >= maxPages;
    if (cut) blocks.push({ type: 'text', text: `[only the first ${maxPages} pages were read; the document may continue]` });
    return mergeText([open, ...blocks.map(toPart), close]);
  }

  function toPart(b: Block): Part {
    if (b.type === 'text') return b;
    // reduced detail only where fine detail doesn't matter; charts, tables and pages stay readable
    const low = b.cls && PHOTO.has(b.cls);
    return { type: 'file', mediaType: b.mediaType, data: { type: 'data', data: b.base64 }, ...(low && { providerOptions: { openai: { imageDetail } } }) };
  }

  async function viaParser(part: LanguageModelV4FilePart): Promise<Part[]> {
    const bytes = await bytesOf(part);
    if (!bytes) return [part]; // remote URL / provider reference: the provider reads it
    // keyed on the file itself so the same upload is parsed once across turns and users
    return parsedCache.get(sha256(bytes, part.mediaType), () => convert(bytes, name(part), part.mediaType));
  }

  /** plain-text attachment -> text part (no parser: exact and free) */
  async function plainText(part: LanguageModelV4FilePart): Promise<Part[]> {
    const bytes = await bytesOf(part);
    if (!bytes) return [part];
    const text = bytes.toString('utf8');
    const cut = text.length > maxTextChars ? `\n[cut after ${maxTextChars} characters; the file continues]` : '';
    return [{ type: 'text', text: `<document name="${name(part)}">\n${text.slice(0, maxTextChars)}${cut}\n</document>` }];
  }

  /** visionModel set: images/PDFs become text from the vision model; the main model gets text only */
  async function viaVisionModel(parts: Part[]): Promise<Part[]> {
    if (!visionModel) return parts;
    const out = await Promise.all(parts.map(async (p): Promise<Part> => {
      if (p.type !== 'file' || p.data.type !== 'data' || !(isImage(p.mediaType) || p.mediaType === PDF)) return p;
      const data = p.data.data;
      try {
        const text = await visionCache.get(sha256(data), () =>
          generateText({
            model: visionModel,
            messages: [{ role: 'user', content: [{ type: 'text', text: visionPrompt }, { type: 'file', mediaType: p.mediaType, data }] }],
          }).then((r) => r.text.trim()));
        return { type: 'text', text: `<vision-model-transcription>\n${text}\n</vision-model-transcription>` };
      } catch (e) {
        onError(e, p.filename ?? p.mediaType);
        return { type: 'text', text: '[image: the vision model could not read it]' };
      }
    }));
    return mergeText(out);
  }

  /** every file part ends up as something the model accepts: converted, passed through, or a short note */
  async function route(p: Part): Promise<Part[]> {
    if (p.type !== 'file') return [p];
    const t = p.mediaType;
    try {
      if (viaDocling(t)) return await viaParser(p);
      if (native.has(t)) return [p];
      if (plainTextTypes(t)) return await plainText(p);
      // remote URL of another type: the provider fetches and reads it
      if (p.data.type === 'url' && p.data.url.protocol !== 'data:') return [p];
      throw new AttachmentError(`this file type (${t}) can't be read`);
    } catch (e) {
      // details go to onError; the model only gets a safe, generic reason
      if (!(e instanceof AttachmentError)) onError(e, p.filename ?? t);
      if (native.has(t)) return [p]; // the model can still read the original
      const reason = e instanceof AttachmentError ? e.message : 'the file could not be read';
      return [{ type: 'text', text: `[attachment "${name(p)}": ${reason}]` }];
    }
  }

  return {
    specificationVersion: 'v4',
    transformParams: async ({ params }) => ({
      ...params,
      prompt: await Promise.all(
        params.prompt.map(async (msg) =>
          msg.role === 'user'
            ? { ...msg, content: (await Promise.all(msg.content.map(async (p) => viaVisionModel(await route(p))))).flat() }
            : msg,
        ),
      ),
    }),
  };
}
