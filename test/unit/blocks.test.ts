// Offline: runs on saved docling-serve responses.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Block, doclingToBlocks, pageBlocks, pageText } from '../../src/index.ts';
import { fixtureJson } from '../helpers.ts';

const doc = fixtureJson('docling-paper.json').document.json_content;
const textOf = (b: Block[]) => b.map((x) => (x.type === 'text' ? x.text : '')).join('\n\n');
const imagesOf = (b: Block[]) => b.filter((x) => x.type === 'image');
const blocks = doclingToBlocks(doc);
const text = textOf(blocks);
const images = imagesOf(blocks);

test('no base64 in text; pictures are image blocks announced right before them', () => {
  assert.ok(!/data:image|[A-Za-z0-9+/]{200,}/.test(text));
  assert.ok(images.every((b) => b.mediaType === 'image/png' && b.base64.length > 100));
  assert.equal(images.length, 4, 'icon dropped, the other 4 pictures sent');
  assert.match(text, /\[image 1 \(flow chart\): Figure 1: Sketch of Docling/);
  assert.ok(!/\bicon\b/.test(text), 'icon neither sent nor mentioned');
  const i1 = blocks.findIndex((b) => b.type === 'image');
  assert.match((blocks[i1 - 1] as any).text, /\[image 1 [^\]]*\]$/);
  assert.deepEqual(
    images.map((b: any) => b.cls),
    ['flow_chart', 'full_page_image', 'line_chart', 'table'],
  );
});

test('structure: headings, lists, code, merged table header, no page furniture', () => {
  assert.match(text, /^## Docling Technical Report/m);
  assert.match(text, /^- /m);
  assert.match(text, /```\nfrom docling/);
  assert.match(text, /\|CPU\|Thread budget\|native backend \/ TTS\|/, 'spanning header merged');
  assert.match(text, /^\|-\|-\|/m, 'compact separator');
  assert.ok(!/ {2,}/.test(text.replace(/```[\s\S]*?```/g, '')), 'no padding runs outside code');
  assert.ok(!text.includes('￿'));
  const lines = new Set(text.split('\n').map((l) => l.trim()));
  for (const f of doc.texts.filter((t: any) => t.content_layer === 'furniture'))
    assert.ok(!lines.has(f.text.trim()), `furniture leaked: ${f.text}`);
  assert.ok(!/Page header\/footer/.test(text), 'PDF furniture stays out');
});

test('text inside charts is sent next to them, capped, and can be turned off', () => {
  assert.match(
    text,
    /\[image 3 \(line chart\)[^\]]*\| text in image: [^\]]*mAP 0\.50:0\.95[^\]]*% of DocLayNet training set/,
  );
  for (const m of text.match(/text in image: [^\]]*/g) ?? []) assert.ok(m.length <= 'text in image: '.length + 604);
  assert.ok(!/text in image/.test(textOf(doclingToBlocks(doc, { pictureTextChars: 0 }))));
});

test('image cap keeps the most informative pictures, in reading order', () => {
  assert.deepEqual(
    imagesOf(doclingToBlocks(doc, { maxImages: 1 })).map((b: any) => b.cls),
    ['table'],
  );
  assert.deepEqual(
    imagesOf(doclingToBlocks(doc, { maxImages: 3 })).map((b: any) => b.cls),
    ['flow_chart', 'line_chart', 'table'],
  );
  assert.match(textOf(doclingToBlocks(doc, { maxImages: 1 })), /\[image not shown \(line chart\)/);
});

test('a repeated picture is sent once', () => {
  const dup = structuredClone(doc);
  dup.body.children.push(dup.body.children.find((c: any) => c.$ref === '#/pictures/1'));
  assert.match(textOf(doclingToBlocks(dup)), /\[repeated image \(flow chart\)/);
  assert.equal(imagesOf(doclingToBlocks(dup)).length, 4);
});

test('pageText: per-page content and the dense-page hint rule', () => {
  const perPage = Object.keys(doc.pages).map((n) => pageText(doc, Number(n)));
  assert.match(perPage[0].text, /^## Docling Technical Report/);
  assert.ok(!perPage[0].text.includes('## 5 Applications'));
  const headers = doc.texts.filter(
    (t: any) => t.label === 'section_header' && t.content_layer === 'body' && !t.parent.$ref.startsWith('#/pictures'),
  );
  for (const h of headers)
    assert.equal(
      perPage.filter((p) => p.text.includes(`# ${h.text.trim()}`)).length,
      1,
      `header on one page: ${h.text}`,
    );
  assert.equal(pageText(doc, 1).hint, undefined, 'short page');
  assert.match(
    pageText(doc, 2).hint ?? '',
    /^Text extracted by a layout parser[^\n]*\n<parser>\n[\s\S]{3000,}\n<\/parser>$/,
    'dense text page',
  );
  assert.ok(pageText(doc, 5).text.length > 3000 && pageText(doc, 5).hint === undefined, 'dense page with a table');
  assert.equal(pageText(doc, 2, 100_000).hint, undefined, 'threshold respected');
});

test('pageBlocks: image pages vs text pages, scores on markers, image cap', () => {
  const withImages = structuredClone(doc);
  for (const p of Object.values<any>(withImages.pages)) p.image = { uri: 'data:image/png;base64,AAAA' };
  const mixed = pageBlocks(withImages, {
    imagePages: new Set([2]),
    scores: new Map([
      [1, 0.93],
      [2, 0.787],
    ]),
  });
  assert.match(
    textOf(mixed),
    /\[page 1, confidence 0\.93\][\s\S]*## Docling Technical Report[\s\S]*\[page 2, confidence 0\.78\]/,
    'scores rounded down',
  );
  assert.equal(imagesOf(mixed).filter((b) => b.base64 === 'AAAA').length, 1, 'only page 2 as a page image');
  const capped = pageBlocks(withImages, { maxPageImages: 3 });
  const cappedText = textOf(capped);
  assert.equal(imagesOf(capped).length, 3);
  assert.match(cappedText.slice(cappedText.indexOf('[page 9]')), /(\w+ ){10}/, 'pages over the cap keep docling text');
  const original = { mediaType: 'image/jpeg', base64: 'ORIG' };
  assert.deepEqual(pageBlocks({ pages: {} }, { original }), [{ type: 'image', ...original }], 'an image is never lost');
});

test('Office: slides, speaker notes, chart data, sheet names, Word header/footer', () => {
  const office = (f: string) => {
    const b = doclingToBlocks(fixtureJson(f).document.json_content);
    return { text: textOf(b), images: imagesOf(b) as any[] };
  };
  const pptx = office('rich-pptx.json');
  for (let n = 1; n <= 5; n++) assert.match(pptx.text, new RegExp(`\\[slide ${n}\\]`));
  assert.match(pptx.text, /\[slide 1\][\s\S]*Notes: Speaker note: open with the Q3 numbers\.[\s\S]*\[slide 2\]/);
  assert.match(pptx.text, /\[chart \(bar chart\)\]\n\|\|Sales\|\n\|-\|-\|\n\|North\|42\|\n\|South\|17\|/);
  assert.deepEqual(
    pptx.images.map((i) => i.cls),
    ['photograph'],
  );
  const xlsx = office('rich-xlsx.json');
  assert.match(xlsx.text, /## Sheet: Sales[\s\S]*\|EU\|1900000\|2100000\|[\s\S]*## Sheet: Notes[\s\S]*Figures in USD/);
  assert.match(xlsx.text, /\[chart \(bar chart\): Revenue chart\]\n\|\|Q1\|[\s\S]*\|\|1900000\|/);
  assert.equal(xlsx.text.match(/Revenue chart/g)?.length, 1, 'caption printed once');
  assert.match(office('rich-docx.json').text, /^Page header\/footer: ACME Corp - Internal \| Confidential/);
});
