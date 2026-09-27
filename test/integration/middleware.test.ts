// Needs a running docling-serve (docker compose up -d): dotenvx run -- npm run test:integration
// OPENAI_API_KEY set = also one real OpenAI round trip.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { convertToModelMessages, generateText, type ModelMessage, wrapLanguageModel } from 'ai';
import { doclingAttachments } from '../../src/index.ts';
import {
  DOCLING_KEY,
  DOCLING_URL,
  file,
  fixture,
  imagesOf,
  mockModel,
  mockResult,
  sameBytes,
  sent,
  T,
  textOf,
  typesOf,
  user,
} from '../helpers.ts';

const up = await fetch(`${DOCLING_URL}/health`).then(
  (r) => r.ok,
  () => false,
);
const docling = { url: DOCLING_URL, apiKey: DOCLING_KEY };

// counts docling conversions to prove caching
let doclingCalls = 0;
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (input, init) => {
    if (String(input).includes('/v1/convert/')) doclingCalls++;
    return realFetch(input, init);
  };
});
after(() => {
  globalThis.fetch = realFetch;
});

describe('with docling-serve', { skip: !up && `docling-serve not reachable at ${DOCLING_URL}` }, () => {
  test('docx: text, table as markdown, embedded photo as an image part', async () => {
    const parts = await sent(user(file('report.docx', T.docx)));
    const text = textOf(parts);
    assert.match(text, /<document name="report.docx">/);
    assert.match(text, /Revenue grew 12%/);
    assert.match(text, /\|\s*EU\s*\|\s*1\.9M\s*\|/);
    assert.equal(imagesOf(parts).length, 1);
    assert.match(text, /\[image 1 \(photograph\)\]/);
    assert.ok(!parts.some((p) => p.type === 'file' && p.mediaType === T.docx), 'original docx removed');
  });

  test('useChat path: FileUIPart data URL -> convertToModelMessages -> middleware', async () => {
    const url = `data:${T.docx};base64,${fixture('report.docx').toString('base64')}`;
    const parts = await sent(
      await convertToModelMessages([
        {
          role: 'user',
          parts: [
            { type: 'text', text: 'Read this' },
            { type: 'file', mediaType: T.docx, filename: 'report.docx', url },
          ],
        },
      ]),
    );
    assert.match(textOf(parts), /Revenue grew 12%/);
    assert.equal(imagesOf(parts).length, 1);
  });

  test('xlsx and pptx', async () => {
    const xlsx = textOf(await sent(user(file('sales.xlsx', T.xlsx))));
    assert.match(xlsx, /\|\s*EU\s*\|\s*100\s*\|\s*120\s*\|/);
    assert.match(xlsx, /Rent/, 'second sheet included');
    const pptx = await sent(user(file('deck.pptx', T.pptx)));
    assert.match(textOf(pptx), /Team/);
    assert.equal(imagesOf(pptx).length, 1);
  });

  test('scanned PDF: low page as its image, confident page as OCR text, logo dropped', async () => {
    let parts = await sent(user(file('scan.pdf', T.pdf)));
    const text = textOf(parts);
    assert.match(text, /\[page 1, confidence 0\.78\][\s\S]*\[page 2, confidence 0\.93\][\s\S]*Stoney/);
    assert.ok(imagesOf(parts).length >= 2, 'page 1 image + page 2 photos');
    assert.ok(!/logo/.test(text));
    parts = await sent(user(file('scan.pdf', T.pdf)), { minConfidence: 0 });
    assert.match(textOf(parts), /Alan Mathison Turing[\s\S]*Stoney/, 'scoring off: OCR text of both pages');
  });

  test('mixed PDF: digital page as text, handwritten page as image', async () => {
    const parts = await sent(user(file('mixed.pdf', T.pdf)));
    const text = textOf(parts);
    assert.match(text, /<document name="mixed\.pdf" confidence="0\.7\d">/, 'tag shows the worst page');
    assert.match(text, /\[page 1, confidence 0\.9\d\][\s\S]*Docling[\s\S]*\[page 2, confidence 0\.7\d\]/);
    assert.equal(imagesOf(parts).length, 1);
  });

  test('every page low: the original PDF, or page images for a model without PDF support', async () => {
    let parts = await sent(user(file('scan.pdf', T.pdf)), { minConfidence: Infinity });
    assert.deepEqual(typesOf(parts), ['text', 'text', 'application/pdf', 'text']);
    assert.match(textOf(parts), /<document name="scan\.pdf" confidence="0\.\d\d">/);
    assert.ok(sameBytes(parts[2].data.data, 'scan.pdf'));
    parts = await sent(user(file('scan.pdf', T.pdf)), {
      minConfidence: Infinity,
      nativeTypes: ['image/png', 'image/jpeg'],
    });
    assert.match(textOf(parts), /\[page 1\][\s\S]*\[page 2\]/);
    assert.equal(imagesOf(parts).length, 2);
  });

  test('imageDetail: photos low by default, charts always full', async () => {
    const detailOf = (parts: any[]) => imagesOf(parts).map((p) => p.providerOptions?.openai?.imageDetail ?? 'full');
    assert.deepEqual(detailOf(await sent(user(file('report.docx', T.docx)))), ['low']);
    assert.deepEqual(detailOf(await sent(user(file('report.docx', T.docx)), { imageDetail: 'high' })), ['high']);
    const paper = await sent(user(file('docling-paper.pdf', T.pdf)), { minConfidence: 0 });
    assert.ok(imagesOf(paper).length >= 3 && detailOf(paper).every((d) => d === 'full'));
  });

  test('images: text when docling is confident, the image when not; a photo is never lost', async () => {
    let parts = await sent(user(file('newspaper.jpg', 'image/jpeg')), { minConfidence: 0 });
    assert.match(textOf(parts), /<document name="newspaper\.jpg" confidence="0\.\d\d">/);
    assert.ok(!imagesOf(parts).some((p) => sameBytes(p.data.data, 'newspaper.jpg')), 'confident: no original');
    assert.ok(textOf(parts).length > 3000);
    parts = await sent(user(file('newspaper.jpg', 'image/jpeg')), { minConfidence: Infinity });
    assert.equal(
      imagesOf(parts).filter((p) => sameBytes(p.data.data, 'newspaper.jpg')).length,
      1,
      'low: original image',
    );
    for (const minConfidence of [0.8, 0]) {
      parts = await sent(user(file('person.png', 'image/png')), { minConfidence });
      assert.equal(imagesOf(parts).length, 1);
      assert.ok(sameBytes(imagesOf(parts)[0].data.data, 'person.png'));
    }
  });

  test('page mode: image always, docling hint only on dense pages without tables', async () => {
    const HINT = /<parser>/;
    let parts = await sent(user(file('newspaper.jpg', 'image/jpeg')), { images: 'pages' });
    assert.match(textOf(parts), HINT);
    assert.ok(sameBytes(imagesOf(parts)[0].data.data, 'newspaper.jpg'), 'original, not a re-render');
    assert.doesNotMatch(textOf(await sent(user(file('handwritten.jpg', 'image/jpeg')), { images: 'pages' })), HINT);
    assert.doesNotMatch(textOf(await sent(user(file('table-page.jpg', 'image/jpeg')), { images: 'pages' })), HINT);
    parts = await sent(user(file('scan.pdf', T.pdf)), { pdf: 'pages' });
    assert.match(textOf(parts), /\[page 1\][\s\S]*\[page 2\]/);
    assert.equal(imagesOf(parts).length, 2, 'one image per page, no picture crops');
    parts = await sent(user(file('docling-paper.pdf', T.pdf)), { pdf: 'pages', maxPageImages: 3 });
    assert.equal(imagesOf(parts).length, 3);
    for (let n = 1; n <= 9; n++) assert.match(textOf(parts), new RegExp(`\\[page ${n}\\]`));
  });

  test('formats: rtf odt epub adoc doc xls ppt tiff bmp; misleading names fixed', async () => {
    const read = async (f: string, t: string) => {
      const parts = await sent(user(file(f, t)));
      assert.ok(
        parts.every((p) => p.type === 'text' || ['image/png', 'image/jpeg', 'application/pdf'].includes(p.mediaType)),
        `${t}: only model-readable parts`,
      );
      return parts;
    };
    for (const [f, t] of [
      ['formats.rtf', 'application/rtf'],
      ['formats.odt', 'application/vnd.oasis.opendocument.text'],
      ['formats.epub', 'application/epub+zip'],
      ['formats.adoc', 'text/asciidoc'],
    ]) {
      assert.match(textOf(await read(f, t)), /EU sales were 1\.9M/, t);
    }
    assert.match(textOf(await read('legacy-table.doc', 'application/msword')), /\|EU\|1\.9M\|/);
    assert.match(textOf(await read('legacy.xls', 'application/vnd.ms-excel')), /\|EU\|100\|120\|[\s\S]*\|Rent\|50\|/);
    const ppt = await read('legacy.ppt', 'application/vnd.ms-powerpoint');
    assert.ok(/Team/.test(textOf(ppt)) && imagesOf(ppt).length === 1);
    assert.deepEqual(
      imagesOf(await read('formats.tiff', 'image/tiff')).map((p) => p.mediaType),
      ['image/png', 'image/png'],
      'tiff page -> png',
    );
    assert.equal(imagesOf(await read('formats.bmp', 'image/bmp'))[0].mediaType, 'image/png');
    const renamed = await sent(
      user({ type: 'file', data: fixture('report.docx'), mediaType: T.docx, filename: 'notes.txt' }),
    );
    assert.match(textOf(renamed), /<document name="notes\.docx">[\s\S]*Revenue grew 12%/);
    const unnamed = await sent(user({ type: 'file', data: fixture('report.docx'), mediaType: T.docx }));
    assert.match(textOf(unnamed), /<document name="attachment\.docx">/);
  });

  test('maxPages: only the first N pages, and the model is told', async () => {
    const text = textOf(await sent(user(file('docling-paper.pdf', T.pdf)), { minConfidence: 0, maxPages: 2 }));
    assert.match(text, /\[only the first 2 pages were read; the document may continue\]/);
    assert.ok(!text.includes('## 5 Applications'));
  });

  test('cache: parsed once across turns, capped by memory', async () => {
    const turn = (middleware: ReturnType<typeof doclingAttachments>, messages: ModelMessage[]) =>
      generateText({ model: wrapLanguageModel({ model: mockModel(), middleware }), messages });
    const mw = doclingAttachments(docling);
    const history: ModelMessage[] = [
      ...user(file('report.docx', T.docx)),
      { role: 'assistant', content: 'A report.' },
      { role: 'user', content: 'Who is pictured?' },
    ];
    let start = doclingCalls;
    for (let i = 0; i < 2; i++) await turn(mw, history);
    assert.equal(doclingCalls - start, 1, 'second turn from cache');
    const small = doclingAttachments({ ...docling, cacheMB: 0.001 });
    start = doclingCalls;
    await turn(small, user(file('report.docx', T.docx)));
    await turn(small, user(file('sales.xlsx', T.xlsx)));
    await turn(small, user(file('report.docx', T.docx)));
    assert.equal(doclingCalls - start, 3, 'evicted under a tiny cap');
  });

  test('visionModel: images become text, main model gets text only, cached', async () => {
    let visionCalls = 0;
    const vision = mockModel({
      doGenerate: async () => {
        visionCalls++;
        return mockResult('TRANSCRIBED BY VISION');
      },
    });
    const mw = doclingAttachments({ ...docling, visionModel: vision });
    for (let i = 0; i < 2; i++) {
      const main = mockModel();
      await generateText({
        model: wrapLanguageModel({ model: main, middleware: mw }),
        messages: user(file('person.png', 'image/png'), file('mixed.pdf', T.pdf)),
      });
      const parts = main.doGenerateCalls[0].prompt.find((m) => m.role === 'user')!.content as any[];
      assert.ok(parts.every((p) => p.type === 'text'));
      assert.equal(textOf(parts).match(/TRANSCRIBED BY VISION/g)?.length, 2, 'photo + low page');
    }
    assert.equal(visionCalls, 2, 'second turn from the vision cache');
  });

  test('OpenAI end to end', { skip: !process.env.OPENAI_API_KEY && 'no OPENAI_API_KEY' }, async () => {
    const { openai } = await import('@ai-sdk/openai');
    const { text } = await generateText({
      model: wrapLanguageModel({
        model: openai(process.env.OPENAI_MODEL ?? 'gpt-5-mini'),
        middleware: doclingAttachments(docling),
      }),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Give the EU sales figure from this report. One line.' },
            file('report.docx', T.docx),
          ],
        },
      ],
    });
    assert.match(text, /1\.9\s*M/);
  });
});
