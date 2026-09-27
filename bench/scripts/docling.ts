// Benchmark pages through docling-serve (the package's own client and OCR settings). Zero LLM calls.
// Writes data/pred/docling/<page>.md (scored) and data/docling-json/<page>.json (confidence + document, for routing).
// usage: dotenvx run -- node bench/scripts/docling.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { convertWithDocling } from '../../src/index.ts';
import { DATA, DOCLING, pageImage, pages, pool, predDir, stem, todo } from './common.ts';

const md = predDir('docling');
const json = `${DATA}/docling-json`;
mkdirSync(json, { recursive: true });

const names = todo(pages(), (n) => `${json}/${n}.json`);
console.log(`${names.length} pages to do`);
await pool(names, 4, async (name) => {
  const t = Date.now();
  try {
    const { doc, pageScores, response } = await convertWithDocling(pageImage(name), name, {
      ...DOCLING,
      timeoutMs: 900_000,
      options: { to_formats: ['md', 'json'], ocr_preset: 'rapidocr' },
    });
    writeFileSync(`${md}/${stem(name)}.md`, response.document.md_content ?? '');
    const confidence = { low_score: response.confidence?.low_score, pages: Object.fromEntries(pageScores) };
    writeFileSync(`${json}/${name}.json`, JSON.stringify({ confidence, seconds: (Date.now() - t) / 1000, doc }));
  } catch (e) {
    console.log('FAIL', name, (e as Error).message.slice(0, 150));
  }
});
