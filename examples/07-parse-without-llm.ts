// No LLM: the docling-serve client and the block converter on their own - e.g. to index documents for search.
// Prints the Markdown the model would receive; pictures become [image] markers.
// Run: dotenvx run -- node examples/07-parse-without-llm.ts test/fixtures/scan.pdf
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { convertWithDocling, doclingToBlocks } from '@ctxwise/ai-sdk-docling';

const path = process.argv[2] ?? 'test/fixtures/scan.pdf';

const { doc, pageScores, score } = await convertWithDocling(await readFile(path), basename(path), {
  url: process.env.DOCLING_URL ?? 'http://localhost:5001',
  apiKey: process.env.DOCLING_API_KEY,
  timeoutMs: 600_000,
  options: {
    to_formats: 'json',
    image_export_mode: 'embedded',
    ocr_preset: 'rapidocr',
    do_picture_classification: 'true',
  },
});

console.log(`confidence ${score?.toFixed(2) ?? 'n/a (office files have none)'}; per page:`, Object.fromEntries(pageScores));
for (const block of doclingToBlocks(doc)) {
  console.log(block.type === 'text' ? block.text : `[image ${block.mediaType}${block.cls ? `, ${block.cls}` : ''}]`);
}
