/**
 * Tuning the middleware: limits, routing, file types, docling options and error logging.
 * Every option not set here keeps its default (see `DEFAULTS`).
 */
import { openai } from '@ai-sdk/openai';
import {
  DOCLING_TYPES,
  doclingAttachments,
  isPlainTextType,
  Mode,
  OPENAI_NATIVE_TYPES,
  PictureClass,
} from '@ctxwise/ai-sdk-docling';
import { wrapLanguageModel } from 'ai';

export const model = wrapLanguageModel({
  model: openai('gpt-5-mini'),
  middleware: doclingAttachments({
    url: process.env.DOCLING_URL ?? 'http://127.0.0.1:5001',
    apiKey: process.env.DOCLING_API_KEY,

    // 1. Limits: smaller files, fewer pages and pictures, a shorter deadline.
    maxFileBytes: 20 * 2 ** 20, // 20 MB
    maxPages: 30,
    maxImages: 5,
    skipClasses: [PictureClass.Logo, PictureClass.Icon, PictureClass.QrCode],
    timeoutMs: 5 * 60_000, // 5 minutes per document

    // 2. Routing: PDFs page by page as images (best tables); images go to vision below 0.85 confidence.
    pdf: Mode.Pages,
    minConfidence: 0.85,

    // 3. File types: pass audio to a model that reads it, read HTML as plain text, accept NDJSON.
    nativeTypes: [...OPENAI_NATIVE_TYPES, 'audio/wav'],
    doclingTypes: Object.fromEntries(Object.entries(DOCLING_TYPES).filter(([type]) => type !== 'text/html')),
    plainTextTypes: (type) => isPlainTextType(type) || type === 'application/x-ndjson',

    // 4. Extra docling-serve options, e.g. OCR languages.
    doclingOptions: { ocr_lang: ['en', 'de'] },

    // 5. Parse failures: the model gets a short note, your logs get the details.
    onError: (error, filename) => console.error({ event: 'attachment_failed', filename, error: String(error) }),
  }),
});
