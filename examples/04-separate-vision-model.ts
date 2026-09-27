// A separate vision model: gpt-5-mini reads pictures and low-confidence pages into text, and the main model
// receives text only. Use it when the main model is expensive or can't read images.
// Run: dotenvx run -- node examples/04-separate-vision-model.ts test/fixtures/mixed.pdf
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { openai } from '@ai-sdk/openai';
import { streamText, wrapLanguageModel } from 'ai';
import { doclingAttachments, noServerDownloads } from 'ai-sdk-docling';

const path = process.argv[2] ?? 'test/fixtures/mixed.pdf';

const model = wrapLanguageModel({
  model: openai('gpt-5'), // main model: the reasoning and the answer
  middleware: doclingAttachments({
    url: process.env.DOCLING_URL ?? 'http://localhost:5001',
    apiKey: process.env.DOCLING_API_KEY,
    visionModel: openai('gpt-5-mini'), // images -> text; cached by content hash
    visionPrompt: 'Transcribe all text exactly, tables as Markdown. For charts list every value. Output only the content.',
  }),
});

const result = streamText({
  model,
  experimental_download: noServerDownloads,
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What does the handwritten page say, and how does it relate to the printed page?' },
      { type: 'file', data: await readFile(path), filename: basename(path), mediaType: 'application/pdf' },
    ],
  }],
});
for await (const delta of result.textStream) process.stdout.write(delta);
