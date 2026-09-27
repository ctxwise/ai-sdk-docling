import { readFileSync } from 'node:fs';
import { generateText, wrapLanguageModel, type ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { doclingAttachments, type DoclingAttachmentsOptions } from '../src/index.ts';

export const DOCLING_URL = process.env.DOCLING_URL ?? 'http://localhost:5001';
export const DOCLING_KEY = process.env.DOCLING_API_KEY;

export const T = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
export const fixtureJson = (f: string) => JSON.parse(fixture(f).toString('utf8'));

/** a canned model response with this text */
export const mockResult = (text: string): any => ({
  content: [{ type: 'text', text }],
  finishReason: { unified: 'stop', raw: 'stop' },
  usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
  warnings: [],
});

/** a model that answers "ok" and records what it was sent */
export const mockModel = (options: ConstructorParameters<typeof MockLanguageModelV4>[0] = {}) =>
  new MockLanguageModelV4({ doGenerate: mockResult('ok'), ...options });

/** the user-message parts the model receives after the middleware */
export async function sent(messages: ModelMessage[], opts: Partial<DoclingAttachmentsOptions> = {}): Promise<any[]> {
  const model = mockModel();
  const middleware = doclingAttachments({ url: DOCLING_URL, apiKey: DOCLING_KEY, ...opts });
  await generateText({ model: wrapLanguageModel({ model, middleware }), messages });
  return model.doGenerateCalls[0].prompt.find((m) => m.role === 'user')!.content as any[];
}

export const user = (...content: any[]): ModelMessage[] => [{ role: 'user', content: [{ type: 'text', text: 'What is in this?' }, ...content] }];
export const file = (f: string, mediaType: string) => ({ type: 'file' as const, data: fixture(f), mediaType, filename: f });
export const textOf = (parts: any[]) => parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
export const imagesOf = (parts: any[]) => parts.filter((p) => p.type === 'file' && p.mediaType.startsWith('image/'));
export const typesOf = (parts: any[]) => parts.map((p) => p.mediaType ?? p.type);
/** whether a file part's data (base64 string or bytes) is exactly the fixture */
export const sameBytes = (data: string | Uint8Array, f: string) =>
  Buffer.from(typeof data === 'string' ? Buffer.from(data, 'base64') : data).equals(fixture(f));
