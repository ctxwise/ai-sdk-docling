/**
 * No LLM: the docling-serve client and block converter on their own, e.g. to index documents for search.
 * Prints the Markdown a model would receive, with pictures as [image] markers.
 *
 * Run: dotenvx run -- node examples/07-parse-without-llm.ts test/fixtures/scan.pdf
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { convertWithDocling, doclingToBlocks } from '@ctxwise/ai-sdk-docling';

const path = process.argv[2] ?? 'test/fixtures/scan.pdf';

// 1. Convert the file with docling-serve: the structured document plus its confidence scores.
const { doc, pageScores, score } = await convertWithDocling(await readFile(path), basename(path), {
  url: process.env.DOCLING_URL ?? 'http://localhost:5001',
  apiKey: process.env.DOCLING_API_KEY,
  timeoutMs: 10 * 60_000,
  options: {
    to_formats: 'json',
    image_export_mode: 'embedded',
    ocr_preset: 'rapidocr',
    do_picture_classification: 'true',
  },
});

// 2. Confidence: scans and PDFs have a score per page; Office files have none.
console.log('confidence:', score?.toFixed(2) ?? 'n/a', Object.fromEntries(pageScores));

// 3. Walk the document in reading order: text blocks as Markdown, pictures as markers.
for (const block of doclingToBlocks(doc)) {
  console.log(block.type === 'text' ? block.text : `[image ${block.mediaType}${block.cls ? `, ${block.cls}` : ''}]`);
}
