/** Client for ctxwise/docling-serve: one request converts a file and returns LLM-ready parts. */
import type { Mode, OcrPreset, PictureClass, TableMode } from './constants.ts';

/** A picture class docling knows today, or one it may add later. */
type AnyPictureClass = PictureClass | (string & {});

/** How the server turns a converted document into parts. Unset options use the server's defaults. */
export interface PartsOptions {
  /** 'docling': text and pictures, low-confidence pages as page images. 'pages': every page as an image. */
  mode?: Exclude<Mode, 'native'>;
  /** the model reads the original file, so the server may answer with a `source` part instead of page renders */
  sourceReadable?: boolean;
  /** pages below this docling confidence (0-1) go to the model as images; 0 = off. Server default 0.8 */
  minConfidence?: number;
  /** pages converted per document; the model is told when a document was cut. Server default 100 */
  maxPages?: number;
  /** page mode: pages with more text than this also get docling's text. Server default 3000 */
  denseChars?: number;
  /** page images per document; later pages go as text. Server default 20 */
  maxPageImages?: number;
  /** pictures per document; charts, diagrams and tables first, photos last. Server default 10 */
  maxImages?: number;
  /** picture classes never sent. Server default ['logo', 'icon'] */
  skipClasses?: readonly AnyPictureClass[];
  /** smaller pictures are dropped (px). Server default 48 */
  minImagePx?: number;
  /** text docling read inside a chart or diagram, sent next to it; 0 = off. Server default 600 */
  pictureTextChars?: number;
}

export type DoclingPart =
  | { type: 'text'; text: string }
  /** base64 image; `page` is set on whole-page renders */
  | { type: 'image'; mediaType: string; data: string; pictureClass?: AnyPictureClass; page?: number }
  /** send the original file here: the model reads it better than docling did */
  | { type: 'source' };

export interface DoclingParts {
  filename: string;
  /** worst page score (0-1), or the document score; undefined for formats without one (Office files) */
  confidence?: number;
  /** page number -> confidence */
  pageConfidence: Record<number, number>;
  /** seconds docling spent converting */
  processingTime: number;
  parts: DoclingPart[];
}

/** POST /v1/convert/file/parts response, as sent by the server. */
interface WireParts {
  filename: string;
  confidence: number | null;
  page_confidence: Record<string, number>;
  processing_time: number;
  parts: (
    | { type: 'text'; text: string }
    | { type: 'image'; media_type: string; data: string; picture_class?: string | null; page?: number | null }
    | { type: 'source' }
  )[];
}

/** docling-serve convert options, sent as form fields. The common ones are typed; any other docling option works too. */
export interface DoclingOptions {
  ocr_preset?: OcrPreset;
  /** OCR languages as BCP-47 tags, in order of preference, e.g. ['en', 'de'] */
  ocr_lang?: readonly string[];
  table_mode?: TableMode;
  [option: string]: string | readonly string[] | undefined;
}

export interface DoclingRequest {
  /** docling-serve base url, e.g. http://127.0.0.1:5001 */
  url: string;
  apiKey?: string;
  /** deadline for the whole conversion */
  timeoutMs: number;
  options?: PartsOptions;
  doclingOptions?: DoclingOptions;
}

const QUERY_NAMES: Record<keyof PartsOptions, string> = {
  mode: 'mode',
  sourceReadable: 'source_readable',
  minConfidence: 'min_confidence',
  maxPages: 'max_pages',
  denseChars: 'dense_chars',
  maxPageImages: 'max_page_images',
  maxImages: 'max_images',
  skipClasses: 'skip_classes',
  minImagePx: 'min_image_px',
  pictureTextChars: 'picture_text_chars',
};

/** Converts one file and returns its parts. */
export async function convertWithDocling(
  bytes: Uint8Array,
  filename: string,
  req: DoclingRequest,
): Promise<DoclingParts> {
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(bytes)]), filename);
  for (const [key, value] of Object.entries(req.doclingOptions ?? {})) {
    for (const v of [value ?? []].flat()) form.append(key, v);
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.options ?? {})) {
    if (value === undefined) continue;
    for (const v of [value].flat()) query.append(QUERY_NAMES[key as keyof PartsOptions], String(v));
  }

  const response = await fetch(`${req.url}/v1/convert/file/parts?${query}`, {
    method: 'POST',
    body: form,
    headers: req.apiKey ? { 'x-api-key': req.apiKey } : undefined,
    signal: AbortSignal.timeout(req.timeoutMs),
  });
  if (!response.ok) throw new Error(`docling HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);

  const wire: WireParts = await response.json();
  return {
    filename: wire.filename,
    confidence: wire.confidence ?? undefined,
    pageConfidence: Object.fromEntries(Object.entries(wire.page_confidence).map(([n, s]) => [Number(n), s])),
    processingTime: wire.processing_time,
    parts: wire.parts.map((p) =>
      p.type === 'image'
        ? {
            type: 'image',
            mediaType: p.media_type,
            data: p.data,
            ...(p.picture_class && { pictureClass: p.picture_class }),
            ...(p.page && { page: p.page }),
          }
        : p,
    ),
  };
}
