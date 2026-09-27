// The same chat endpoint on plain Node (no framework) - works with `useChat` on any frontend.
// Run: dotenvx run -- node examples/03-node-http-server.ts   then POST { messages } to http://localhost:3000
import { createServer } from 'node:http';
import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, type UIMessage, wrapLanguageModel } from 'ai';
import { doclingAttachments, noServerDownloads } from 'ai-sdk-docling';

const model = wrapLanguageModel({
  model: openai('gpt-5-mini'),
  middleware: doclingAttachments({
    url: process.env.DOCLING_URL ?? 'http://localhost:5001',
    apiKey: process.env.DOCLING_API_KEY,
  }),
});

createServer(async (req, res) => {
  if (req.method !== 'POST') return res.writeHead(405).end();
  let body = '';
  for await (const chunk of req) body += chunk;
  const { messages }: { messages: UIMessage[] } = JSON.parse(body);
  streamText({
    model,
    messages: await convertToModelMessages(messages),
    experimental_download: noServerDownloads,
  }).pipeUIMessageStreamToResponse(res);
}).listen(3000, () => console.log('listening on http://localhost:3000'));
