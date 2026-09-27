// Summarize any document with one call - PDF, scan, Word, PowerPoint, Excel, image.
// Run: dotenvx run -- node examples/01-summarize-file.ts test/fixtures/report.docx
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { openai } from '@ai-sdk/openai';
import { DOCLING_TYPES, doclingAttachments, noServerDownloads } from '@ctxwise/ai-sdk-docling';
import { generateText, wrapLanguageModel } from 'ai';

const path = process.argv[2] ?? 'test/fixtures/report.docx';
// media type from the extension, using the package's own table (text/plain for anything else)
const mediaType =
  Object.entries(DOCLING_TYPES).find(([, ext]) => path.toLowerCase().endsWith(`.${ext}`))?.[0] ?? 'text/plain';

const model = wrapLanguageModel({
  model: openai('gpt-5-mini'),
  middleware: doclingAttachments({
    url: process.env.DOCLING_URL ?? 'http://localhost:5001',
    apiKey: process.env.DOCLING_API_KEY,
  }),
});

const { text, usage } = await generateText({
  model,
  experimental_download: noServerDownloads,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Summarize this document in five bullet points, with the key numbers.' },
        { type: 'file', data: await readFile(path), filename: basename(path), mediaType },
      ],
    },
  ],
});

console.log(text);
console.log(`\n${usage.inputTokens} input tokens`);
