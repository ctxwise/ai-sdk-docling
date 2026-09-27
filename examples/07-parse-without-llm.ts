/**
 * No LLM: the docling client on its own, e.g. to index documents for search.
 * Prints the Markdown a model would receive, with pictures as [image] markers.
 *
 * Run: dotenvx run -- node examples/07-parse-without-llm.ts test/fixtures/scan.pdf
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { convertWithDocling } from '@ctxwise/ai-sdk-docling';

const path = process.argv[2] ?? 'test/fixtures/scan.pdf';

// 1. Convert the file: parts in reading order, plus docling's confidence.
//    minConfidence 0 keeps every page as text (no page images), which is what search indexing wants.
const { confidence, pageConfidence, parts } = await convertWithDocling(await readFile(path), basename(path), {
  url: process.env.DOCLING_URL ?? 'http://127.0.0.1:5001',
  apiKey: process.env.DOCLING_API_KEY,
  timeoutMs: 10 * 60_000,
  options: { minConfidence: 0 },
});

// 2. Confidence: scans and PDFs have a score per page; Office files have none.
console.log('confidence:', confidence?.toFixed(2) ?? 'n/a', pageConfidence);

// 3. Text as Markdown, pictures as markers.
for (const part of parts) {
  if (part.type === 'text') console.log(part.text);
  else if (part.type === 'image')
    console.log(`[image ${part.mediaType}${part.pictureClass ? `, ${part.pictureClass}` : ''}]`);
}
