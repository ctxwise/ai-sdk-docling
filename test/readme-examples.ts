// The README's code samples, type-checked by `npm run typecheck` (never run). Keep in sync with README.md.
import { readFile } from 'node:fs/promises';
import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, generateText, streamText, wrapLanguageModel } from 'ai';
import {
  DOCLING_TYPES,
  doclingAttachments,
  isPlainTextType,
  noServerDownloads,
  OPENAI_NATIVE_TYPES,
} from '../src/index.ts';

// Usage A: chat route
const model = wrapLanguageModel({
  model: openai('gpt-5-mini'),
  middleware: doclingAttachments({ url: process.env.DOCLING_URL!, apiKey: process.env.DOCLING_API_KEY }),
});

export async function POST(req: Request) {
  const { messages } = await req.json();
  return streamText({
    model,
    messages: await convertToModelMessages(messages),
    experimental_download: noServerDownloads,
  }).toUIMessageStreamResponse();
}

// Usage B: server-only
export async function serverOnly() {
  const { text } = await generateText({
    model,
    experimental_download: noServerDownloads,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Summarize this contract and list every deadline.' },
          {
            type: 'file',
            data: await readFile('contract.docx'),
            filename: 'contract.docx',
            mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        ],
      },
    ],
  });
  return text;
}

// Presets
const base = { url: process.env.DOCLING_URL!, apiKey: process.env.DOCLING_API_KEY };
doclingAttachments(base);
doclingAttachments({ ...base, pdf: 'pages', images: 'pages' });
doclingAttachments({ ...base, minConfidence: 0, maxImages: 0 });
doclingAttachments({ ...base, pdf: 'native', images: 'native' });
doclingAttachments({ ...base, nativeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] });

// Choosing models: separate vision model, main model sees text only
const twoModels = wrapLanguageModel({
  model: openai('gpt-5'),
  middleware: doclingAttachments({
    url: process.env.DOCLING_URL!,
    apiKey: process.env.DOCLING_API_KEY,
    visionModel: openai('gpt-5-mini'),
  }),
});
streamText({ model: twoModels, messages: [] });

// Configuration
doclingAttachments({
  ...base,
  maxFileBytes: 20 * 2 ** 20,
  maxPages: 30,
  maxImages: 5,
  nativeTypes: [...OPENAI_NATIVE_TYPES, 'audio/wav'],
  doclingTypes: Object.fromEntries(Object.entries(DOCLING_TYPES).filter(([t]) => t !== 'text/html')),
  plainTextTypes: (t) => isPlainTextType(t) || t === 'application/x-ndjson',
  doclingOptions: { ocr_lang: ['en', 'de'] },
});
