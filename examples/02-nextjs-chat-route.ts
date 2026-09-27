// Next.js App Router: app/api/chat/route.ts. The client is a normal `useChat` page (see README); attachments
// arrive as data URLs and are parsed here, before the model sees them.
import { openai } from '@ai-sdk/openai';
import { doclingAttachments, noServerDownloads } from '@ctxwise/ai-sdk-docling';
import { convertToModelMessages, streamText, type UIMessage, wrapLanguageModel } from 'ai';

// module scope: one middleware (and one parse cache) for all requests
const model = wrapLanguageModel({
  model: openai('gpt-5-mini'),
  middleware: doclingAttachments({
    url: process.env.DOCLING_URL ?? 'http://localhost:5001',
    apiKey: process.env.DOCLING_API_KEY,
  }),
});

export const maxDuration = 300; // docling takes seconds per page on CPU

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const result = streamText({
    model,
    system: 'Answer from the attached documents. Say so when something is not in them.',
    messages: await convertToModelMessages(messages),
    experimental_download: noServerDownloads, // never fetch user-supplied URLs server-side (SSRF)
  });
  return result.toUIMessageStreamResponse();
}
