/** docling-serve client: upload one file, wait for the async task, return the document and its confidence. */

export interface DoclingRef {
  $ref: string;
}

/** The parts of a DoclingDocument item this package reads. */
export interface DoclingItem {
  self_ref: string;
  parent?: DoclingRef;
  children?: DoclingRef[];
  content_layer?: string;
  label?: string;
  name?: string;
  text?: string;
  level?: number;
  enumerated?: boolean;
  prov?: { page_no: number }[];
  captions?: DoclingRef[];
  image?: { uri?: string; mimetype?: string; size?: { width: number; height: number } };
  meta?: {
    classification?: { predictions?: { class_name: string }[] };
    tabular_chart?: { chart_data?: DoclingTableData };
  } | null;
  data?: DoclingTableData;
}

export interface DoclingTableData {
  grid?: { text?: string; column_header?: boolean }[][];
}

/** The parts of a DoclingDocument (docling-serve `json_content`) this package reads. */
export interface DoclingDocument {
  origin?: { mimetype?: string };
  body?: { children?: DoclingRef[] };
  texts?: DoclingItem[];
  pictures?: DoclingItem[];
  tables?: DoclingItem[];
  groups?: DoclingItem[];
  pages?: Record<string, { image?: { uri?: string } }>;
}

export interface DoclingRequest {
  /** docling-serve base url, e.g. http://localhost:5001 */
  url: string;
  apiKey?: string;
  /** overall deadline, including docling's queue */
  timeoutMs: number;
  /** docling-serve convert options; array values are sent as repeated form fields */
  options: Record<string, string | string[]>;
}

export interface DoclingResult {
  doc: DoclingDocument;
  /** per-page confidence (docling `low_score`, 0-1); empty when the server doesn't return page scores */
  pageScores: Map<number, number>;
  /** worst page score, or docling's document score when page scores are missing */
  score?: number;
  /** the full docling-serve response (markdown, timings, ...) */
  response: any;
}

/** Converts one file with docling-serve's async API (no server-side sync-wait limit for long documents). */
export async function convertWithDocling(bytes: Uint8Array, filename: string, req: DoclingRequest): Promise<DoclingResult> {
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(bytes)]), filename);
  for (const [k, v] of Object.entries(req.options)) for (const x of [v].flat()) form.append(k, x);

  const signal = AbortSignal.timeout(req.timeoutMs);
  const headers = req.apiKey ? { 'x-api-key': req.apiKey } : undefined;
  const call = async (path: string, init?: RequestInit) => {
    const r = await fetch(`${req.url}${path}`, { headers, signal, ...init });
    if (!r.ok) throw new Error(`docling HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };

  let task = await call('/v1/convert/file/async', { method: 'POST', body: form });
  while (task.task_status !== 'success' && task.task_status !== 'failure') {
    task = await call(`/v1/status/poll/${task.task_id}?wait=5`);
  }
  if (task.task_status === 'failure') throw new Error(`docling task failed: ${task.error_message ?? 'unknown'}`);
  const response = await call(`/v1/result/${task.task_id}`);
  if (response.status !== 'success' && response.status !== 'partial_success') {
    throw new Error(`docling status ${response.status}: ${JSON.stringify(response.errors).slice(0, 300)}`);
  }

  // per-page scores come from our docling image's patch (server/patch_page_confidence.py)
  const pageScores = new Map<number, number>();
  for (const [page, s] of Object.entries<any>(response.confidence?.pages ?? {})) {
    if (typeof s?.low_score === 'number') pageScores.set(Number(page), s.low_score);
  }
  const score = pageScores.size ? Math.min(...pageScores.values()) : (response.confidence?.low_score ?? undefined);
  return { doc: response.document.json_content, pageScores, score, response };
}
