/**
 * Typed JSON out of a document: docling parses the tables, charts and scans; the model fills a schema.
 *
 * Run: dotenvx run -- node examples/05-structured-extraction.ts test/fixtures/rich.xlsx
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { openai } from '@ai-sdk/openai';
import { doclingAttachments, mediaTypeOf, noServerDownloads } from '@ctxwise/ai-sdk-docling';
import { generateText, jsonSchema, Output, wrapLanguageModel } from 'ai';

const path = process.argv[2] ?? 'test/fixtures/rich.xlsx';

// 1. The shape to extract.
interface Report {
  title: string;
  currency: string | null;
  figures: { label: string; period: string; value: number }[];
}

const schema = jsonSchema<Report>({
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
});

// 2. The wrapped model, as in every other example.
const model = wrapLanguageModel({
  model: openai('gpt-5-mini'),
  middleware: doclingAttachments({
    url: process.env.DOCLING_URL ?? 'http://localhost:5001',
    apiKey: process.env.DOCLING_API_KEY,
  }),
});

// 3. Ask for structured output against the attached file.
const { output } = await generateText({
  model,
  experimental_download: noServerDownloads,
  output: Output.object({ schema }),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract every reported figure from this document.' },
        { type: 'file', data: await readFile(path), filename: basename(path), mediaType: mediaTypeOf(path) },
      ],
    },
  ],
});

console.table(output.figures);
