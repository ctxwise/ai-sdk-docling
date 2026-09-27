// Structured data out of a document: tables, charts and scans parsed by docling, fields extracted as typed JSON.
// Run: dotenvx run -- node examples/05-structured-extraction.ts test/fixtures/rich.xlsx
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { openai } from '@ai-sdk/openai';
import { generateText, jsonSchema, Output, wrapLanguageModel } from 'ai';
import { DOCLING_TYPES, doclingAttachments, noServerDownloads } from 'ai-sdk-docling';

const path = process.argv[2] ?? 'test/fixtures/rich.xlsx';
const mediaType =
  Object.entries(DOCLING_TYPES).find(([, ext]) => path.toLowerCase().endsWith(`.${ext}`))?.[0] ?? 'text/plain';

interface Report {
  title: string;
  currency: string | null;
  figures: { label: string; period: string; value: number }[];
}

const model = wrapLanguageModel({
  model: openai('gpt-5-mini'),
  middleware: doclingAttachments({
    url: process.env.DOCLING_URL ?? 'http://localhost:5001',
    apiKey: process.env.DOCLING_API_KEY,
  }),
});

const { output } = await generateText({
  model,
  experimental_download: noServerDownloads,
  output: Output.object({
    schema: jsonSchema<Report>({
      type: 'object',
      additionalProperties: false,
      required: ['title', 'currency', 'figures'],
      properties: {
        title: { type: 'string' },
        currency: { type: ['string', 'null'] },
        figures: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'period', 'value'],
            properties: { label: { type: 'string' }, period: { type: 'string' }, value: { type: 'number' } },
          },
        },
      },
    }),
  }),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract every reported figure from this document.' },
        { type: 'file', data: await readFile(path), filename: basename(path), mediaType },
      ],
    },
  ],
});

console.table(output.figures);
