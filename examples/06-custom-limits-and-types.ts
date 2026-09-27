// Tuning: limits, supported file types, docling options, error reporting. Every default is in DEFAULTS.
import { openai } from '@ai-sdk/openai';
import {
  DEFAULTS,
  DOCLING_TYPES,
  doclingAttachments,
  isPlainTextType,
  OPENAI_NATIVE_TYPES,
} from '@ctxwise/ai-sdk-docling';
import { wrapLanguageModel } from 'ai';

export const model = wrapLanguageModel({
  model: openai('gpt-5-mini'),
  middleware: doclingAttachments({
    url: process.env.DOCLING_URL ?? 'http://localhost:5001',
    apiKey: process.env.DOCLING_API_KEY,

    // limits
    maxFileBytes: 20 * 2 ** 20, // 20 MB
    maxPages: 30,
    maxImages: 5,
    timeoutMs: DEFAULTS.timeoutMs / 3, // 5 min

    // routing: page mode for PDFs (best tables), hybrid for images; stricter confidence
    pdf: 'pages',
    minConfidence: 0.85,

    // file types: pass audio to a model that reads it, read HTML as plain text, accept NDJSON
    nativeTypes: [...OPENAI_NATIVE_TYPES, 'audio/wav'],
    doclingTypes: Object.fromEntries(Object.entries(DOCLING_TYPES).filter(([t]) => t !== 'text/html')),
    plainTextTypes: (t) => isPlainTextType(t) || t === 'application/x-ndjson',

    // docling-serve options: OCR languages
    doclingOptions: { ocr_lang: ['en', 'de'] },

    // parse failures: the model gets a generic note, your logs get the details
    onError: (error, filename) =>
      console.error(JSON.stringify({ event: 'attachment_failed', filename, error: String(error) })),
  }),
});
