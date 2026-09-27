/** Media types OpenAI (Responses API via @ai-sdk/openai) accepts as file parts; it throws on any other. */
export const OPENAI_NATIVE_TYPES: readonly string[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

/** Media types docling reads -> the extension docling detects them by (it picks the parser from the file name). */
export const DOCLING_TYPES: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/msword': 'doc',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'application/epub+zip': 'epub',
  'text/html': 'html',
  'application/xhtml+xml': 'xhtml',
  'text/csv': 'csv',
  'text/asciidoc': 'adoc',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/tiff': 'tiff',
  'image/bmp': 'bmp',
};

// extensions not in DOCLING_TYPES, plus the aliases people actually use
const EXTRA_TYPES: Readonly<Record<string, string>> = {
  jpeg: 'image/jpeg',
  tif: 'image/tiff',
  htm: 'text/html',
  gif: 'image/gif',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
};

/**
 * Media type from a file name's extension - for files read on the server, where no browser supplies one.
 * Unknown extensions give `application/octet-stream`, which the middleware reports to the model as unreadable.
 */
export function mediaTypeOf(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return (
    EXTRA_TYPES[ext] ?? Object.entries(DOCLING_TYPES).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream'
  );
}

/** Default test for attachments read as-is (exact, no parser): text/* and common text-based application types. */
export const isPlainTextType = (mediaType: string): boolean =>
  mediaType.startsWith('text/') ||
  /^application\/(json|xml|x-yaml|yaml|toml|javascript|typescript|x-sh|sql|x-python)$/.test(mediaType);

/**
 * Safe display/upload name. docling picks its parser from the extension, so the extension always follows
 * the media type (a docx named "notes.txt" is uploaded as "notes.docx").
 */
export function safeName(
  filename: string | undefined,
  mediaType: string,
  types: Record<string, string> = DOCLING_TYPES,
): string {
  const name = (filename ?? 'attachment').replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(-100);
  const ext = types[mediaType];
  if (!ext) return name;
  return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name.replace(/\.[a-z0-9]{1,5}$/i, '')}.${ext}`;
}
