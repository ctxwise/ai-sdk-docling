<div align="center">

# ai-sdk-docling

**Chat attachments any LLM can read.**<br/>
Vercel AI SDK middleware that parses PDFs, scans, Office files and images with docling,<br/>
and sends the vision model only what OCR can't read.

[![npm](https://img.shields.io/npm/v/@ctxwise/ai-sdk-docling?color=2a78d6)](https://www.npmjs.com/package/@ctxwise/ai-sdk-docling)
[![CI](https://github.com/ctxwise/ai-sdk-docling/actions/workflows/ci.yml/badge.svg)](https://github.com/ctxwise/ai-sdk-docling/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2a78d6)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-2a78d6)](package.json)
[![AI SDK](https://img.shields.io/badge/AI%20SDK-v7-000000)](https://ai-sdk.dev)

[Quick start](#quick-start) · [Examples](#examples) · [How it works](#how-it-works) · [Configuration](#configuration) ·
[Benchmarks](#results) · [Comparison](docs/COMPARISON.md) · [Contributing](CONTRIBUTING.md)

</div>

---

## Features

- **Every attachment works.** PDF, scans, DOCX/DOC, PPTX/PPT, XLSX/XLS, ODF, RTF, EPUB, HTML, CSV, images, plain
  text. OpenAI's provider throws on anything but PDFs and images; here every file becomes parts the model accepts.
- **OCR for text, vision for the rest.** Docling reads layout, text and tables; charts and photos go to the model as
  images; only pages docling reads unreliably (by its own per-page confidence) go as page images.
- **Structure kept.** Tables as Markdown with merged headers, slide numbers, speaker notes, sheet names, and the data
  behind PowerPoint and Excel charts.
- **Any model setup.** One vision model, or a separate `visionModel` that reads images into text for a main model.
- **Production-minded.** Parse cache keyed by content hash, file/page/time limits, no server-side URL fetching
  (SSRF), sanitized names, safe error notes, CPU-only self-hosted docling.
- **Measured.** Tuned on OmniDocBench; compared with docling alone, PyMuPDF4LLM and MarkItDown.

| 88 hard pages (handwriting, tables, charts, layouts) | This project | docling alone | PyMuPDF4LLM | MarkItDown + OCR |
|---|---|---|---|---|
| Text error (lower is better) | **0.112** | 0.171 | 0.311 | 0.166 |
| Table accuracy, TEDS (higher is better) | **79.1** | 68.6 | 35.0 | 0.0 |
| Pages sent to an LLM | 40% | 0% | 0% | 100% |

## Quick start

**1. Install**

```bash
npm install @ctxwise/ai-sdk-docling   # peer dependencies: ai@7, @ai-sdk/provider@4
```

**2. Start docling-serve** (the image in this repository: the official release plus LibreOffice and per-page
confidence). Needs Docker and [dotenvx](https://dotenvx.com) for the key:

```bash
cp .env.example .env
dotenvx set DOCLING_API_KEY "$(openssl rand -hex 24)"
dotenvx run -- docker compose up -d --build
```

**3. Wrap your model** once, at module scope (the parse cache is shared across requests), and use it anywhere
you'd use the plain model - `streamText`, `generateText`, a `useChat` route:

```ts
import { openai } from '@ai-sdk/openai';
import { wrapLanguageModel } from 'ai';
import { doclingAttachments } from '@ctxwise/ai-sdk-docling';

export const model = wrapLanguageModel({
  model: openai('gpt-5-mini'),
  middleware: doclingAttachments({ url: process.env.DOCLING_URL!, apiKey: process.env.DOCLING_API_KEY }),
});
```

Pass `experimental_download: noServerDownloads` on each call so the AI SDK never fetches user-supplied URLs from
your server. Complete routes and scripts are under [Examples](#examples).

## Examples

Runnable, type-checked examples live in [examples/](examples/README.md). The most common setups:

<details open>
<summary><b>Next.js chat with file uploads</b> - route + client</summary>

```ts
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, wrapLanguageModel, type UIMessage } from 'ai';
import { doclingAttachments, noServerDownloads } from '@ctxwise/ai-sdk-docling';

const model = wrapLanguageModel({
  model: openai('gpt-5-mini'),
  middleware: doclingAttachments({ url: process.env.DOCLING_URL!, apiKey: process.env.DOCLING_API_KEY }),
});

export const maxDuration = 300;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  return streamText({
    model,
    messages: await convertToModelMessages(messages),
    experimental_download: noServerDownloads, // never fetch user-supplied URLs server-side (SSRF)
  }).toUIMessageStreamResponse();
}
```

```tsx
// app/page.tsx - a standard useChat page; files are sent as data URLs
'use client';
import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export default function Chat() {
  const { messages, sendMessage } = useChat();
  const [files, setFiles] = useState<FileList | undefined>();
  const [input, setInput] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); sendMessage({ text: input, files }); setInput(''); setFiles(undefined); }}>
      {messages.map((m) => <div key={m.id}>{m.parts.map((p, i) => (p.type === 'text' ? <p key={i}>{p.text}</p> : null))}</div>)}
      <input type="file" multiple onChange={(e) => setFiles(e.target.files ?? undefined)} />
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your files" />
    </form>
  );
}
```

</details>

<details>
<summary><b>Server-side, no UI</b> - summarize a file</summary>

```ts
import { readFile } from 'node:fs/promises';
import { generateText } from 'ai';

const { text } = await generateText({
  model, // wrapped as above
  experimental_download: noServerDownloads,
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Summarize this contract and list every deadline.' },
      { type: 'file', data: await readFile('contract.docx'), filename: 'contract.docx',
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    ],
  }],
});
```

</details>

<details>
<summary><b>Structured extraction</b> - typed JSON from a spreadsheet, scan or PDF</summary>

```ts
import { generateText, jsonSchema, Output } from 'ai';

const { output } = await generateText({
  model,
  output: Output.object({
    schema: jsonSchema<{ figures: { label: string; period: string; value: number }[] }>({
      type: 'object',
      required: ['figures'],
      properties: {
        figures: {
          type: 'array',
          items: {
            type: 'object',
            required: ['label', 'period', 'value'],
            properties: { label: { type: 'string' }, period: { type: 'string' }, value: { type: 'number' } },
          },
        },
      },
    }),
  }),
  messages: [{ role: 'user', content: [
    { type: 'text', text: 'Extract every reported figure.' },
    { type: 'file', data: await readFile('q2.xlsx'), filename: 'q2.xlsx',
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  ] }],
});
```

</details>

<details>
<summary><b>Separate vision model</b> - main model sees text only</summary>

```ts
const model = wrapLanguageModel({
  model: openai('gpt-5'),
  middleware: doclingAttachments({
    url: process.env.DOCLING_URL!,
    apiKey: process.env.DOCLING_API_KEY,
    visionModel: openai('gpt-5-mini'),
  }),
});
```

</details>

<details>
<summary><b>Plain Node server</b> - the chat endpoint without a framework</summary>

```ts
import { createServer } from 'node:http';

createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const { messages } = JSON.parse(body);
  streamText({ model, messages: await convertToModelMessages(messages), experimental_download: noServerDownloads })
    .pipeUIMessageStreamToResponse(res);
}).listen(3000);
```

</details>

<details>
<summary><b>Without an LLM</b> - parse to Markdown for search or storage</summary>

```ts
import { convertWithDocling, doclingToBlocks } from '@ctxwise/ai-sdk-docling';

const { doc, score } = await convertWithDocling(await readFile('scan.pdf'), 'scan.pdf', {
  url: 'http://localhost:5001',
  apiKey: process.env.DOCLING_API_KEY,
  timeoutMs: 600_000,
  options: { to_formats: 'json', image_export_mode: 'embedded', ocr_preset: 'rapidocr' },
});
const markdown = doclingToBlocks(doc).map((b) => (b.type === 'text' ? b.text : '[image]')).join('\n\n');
```

</details>

## How it works

```mermaid
flowchart LR
    A[attachment] --> B{type}
    B -->|PDF, image, Office,<br/>ODF, RTF, EPUB, HTML, CSV| C[docling]
    B -->|TXT MD JSON code| T[text, read as-is]
    B -->|anything else| N[short note]
    C --> D{each page:<br/>confidence >= 0.8?}
    D -->|yes| E[text + tables<br/>+ picture crops]
    D -->|no| F[the page as an image]
    E --> M[model]
    F --> M
    T --> M
    N --> M
```

The default is a hybrid, decided page by page:

1. **Docling reads every page** - layout, reading order, text, tables (as Markdown, merged headers kept).
2. **Pictures go to the vision model as images.** Docling crops each chart, diagram, photo or map, labels its type
   and attaches its caption and the text it read inside it, so a chart arrives with its exact numbers in writing.
   Logos and icons are dropped; photos go at low detail (cheap), charts at full detail.
3. **Pages docling reads unreliably go as images.** Docling scores each page (OCR + layout, 0-1). Below
   `minConfidence` (0.8) - handwriting, bad scans - that page goes to the model as an image instead of docling's
   text. Only that page: the rest of the document stays text. If every page is low, the original PDF goes instead.

Each attachment is wrapped as `<document name="..." confidence="0.86">` (the worst page's score), so the model knows
where each file starts and how far to trust its text. A mixed PDF - one clean page, one handwritten page - arrives as:

```
<document name="mixed.pdf" confidence="0.79">
[page 1, confidence 0.94]
Here is what Docling delivers today: ...   <- docling text
[page 2, confidence 0.79]
<image/png part>                           <- the page image, for the vision model
</document>
```

Parsed documents are cached by content hash: chat history re-sends every attachment each turn, but each file is
parsed once.

## Choosing models

**One model (default).** The model you pass to `streamText` receives the text and the images and reads both. It
must accept images (and PDFs, for the all-pages-low fallback). With `gpt-5-mini` this is the best setup measured.

**A separate vision model.** Set `visionModel` and the middleware sends every image and fallback page to that model
first, and replaces it with the model's transcription. The model in `streamText` then receives **text only**:

```mermaid
sequenceDiagram
    participant S as streamText (main model)
    participant M as middleware
    participant D as docling-serve
    participant V as visionModel
    S->>M: user message + attachment
    M->>D: the file
    D-->>M: text, tables, picture crops, page scores
    M->>V: each picture and low-confidence page (in parallel)
    V-->>M: transcription (tables as Markdown, chart values, photo description)
    M-->>S: text only
    S-->>S: answers the user
```

```ts
const model = wrapLanguageModel({
  model: openai('gpt-5'),                       // main model: reasoning and the answer; sees text only
  middleware: doclingAttachments({
    url: process.env.DOCLING_URL!,
    apiKey: process.env.DOCLING_API_KEY,
    visionModel: openai('gpt-5-mini'),          // reads images and low-confidence pages into text
  }),
});

streamText({ model, messages }); // unchanged
```

Any two AI SDK models work, from any providers - the main model can even be text-only. Use it when:

- **the main model is expensive**: image tokens are billed at the vision model's price instead, or
- **the main model can't read images or PDFs** at all.

Trade-offs: the main model reads a description of each picture instead of seeing it, and one extra model call is
made per image (in parallel, cached by content hash, so history turns cost nothing). Pick a capable vision model:
on the hard pages `gpt-5-mini` scored 0.168 text error, `gpt-5-nano` 0.503 - worse than docling alone. The
instruction it gets is `visionPrompt`.

When the main model is `gpt-5-mini`, don't set `visionModel`: it reads the images itself, for less.

## Presets

```ts
const base = { url: process.env.DOCLING_URL!, apiKey: process.env.DOCLING_API_KEY };

doclingAttachments(base);                                        // hybrid (default)
doclingAttachments({ ...base, pdf: 'pages', images: 'pages' });  // page mode
doclingAttachments({ ...base, minConfidence: 0, maxImages: 0 }); // docling text only
doclingAttachments({ ...base, pdf: 'native', images: 'native' }); // no docling for PDFs and images
```

| Preset | Text error | Reading order | Tables (TEDS) | Input tokens / page | Use when |
|---|---|---|---|---|---|
| **Hybrid** (default) | **0.112** | 0.242 | 79.1 | ~2.2K | general use: best text at 40% of pages as images |
| Page mode | 0.111 | **0.217** | **86.3** | ~3.8K | tables and complex layouts matter most |
| Docling text only | 0.171 | 0.349 | 68.6 | ~1.1K | lowest cost; pictures become caption lines |
| Native | - | - | - | provider's | trusted digital PDFs, speed first; Office files still use docling |

Measured on the 88 hard pages with `gpt-5-mini`. In page mode every PDF page and image goes as an image, plus
docling's text on dense pages without tables (vision alone misreads small print). A photo uploaded on its own always
reaches the model, whatever the preset.

## Configuration

`doclingAttachments(options)` - only `url` is required.

**What goes where**

| Option | Default | |
|---|---|---|
| `pdf` | `'docling'` | `'docling'` hybrid · `'pages'` page images · `'native'` the provider reads the PDF |
| `images` | `'docling'` | the same three modes for image attachments |
| `minConfidence` | `0.8` | pages below this docling confidence go as images; `0` = never |
| `visionModel` | - | a separate model that turns images into text ([Choosing models](#choosing-models)) |
| `visionPrompt` | built-in | its instruction: exact text and tables, chart values, short photo description |

**Pictures**

| Option | Default | |
|---|---|---|
| `maxImages` | `10` | pictures per document - charts, diagrams and tables first, photos last; the rest become a caption line |
| `imageDetail` | `'low'` | detail for photos, signatures and stamps; charts, tables and pages always full detail |
| `pictureTextChars` | `600` | text docling read inside a chart or diagram, sent next to it; `0` = off |
| `skipClasses` | `['logo', 'icon']` | picture types never sent |
| `minImagePx` | `48` | smaller pictures are dropped |

**Limits**

| Option | Default | |
|---|---|---|
| `maxFileBytes` | 50 MB | larger files pass through (PDF, images) or get a note |
| `maxPages` | `100` | pages parsed per document; the model is told when a document was cut |
| `maxPageImages` | `20` | page images per document; later pages go as text |
| `maxTextChars` | 200,000 | cap for plain-text attachments |
| `denseChars` | `3000` | page mode: pages with more text than this also get docling's text |
| `timeoutMs` | 15 min | per document, including docling's queue |
| `cacheMB` | `256` | in-process cache of parsed documents |

**File types and docling**

| Option | Default | |
|---|---|---|
| `nativeTypes` | `OPENAI_NATIVE_TYPES` | media types the model accepts as-is (PDF, PNG, JPEG, WEBP, GIF) |
| `doclingTypes` | `DOCLING_TYPES` | media types docling parses, mapped to the extension docling needs |
| `plainTextTypes` | `isPlainTextType` | media types read as plain text |
| `doclingOptions` | - | extra [docling-serve options](https://github.com/docling-project/docling-serve/blob/main/docs/usage.md), e.g. `{ ocr_lang: ['en', 'de'] }` |
| `fetchUrls` | `false` | download `http(s)` file URLs server-side (off: SSRF risk) |
| `onError` | `console.warn` | receives parse errors; the model only gets a generic note |

Every default is exported as `DEFAULTS`, and the type tables as `DOCLING_TYPES`, `OPENAI_NATIVE_TYPES` and
`isPlainTextType`, so they can be extended rather than copied:

```ts
import { DOCLING_TYPES, doclingAttachments, isPlainTextType, OPENAI_NATIVE_TYPES } from '@ctxwise/ai-sdk-docling';

doclingAttachments({
  ...base,
  maxFileBytes: 20 * 2 ** 20,
  maxPages: 30,
  maxImages: 5,
  // a model that also reads audio: pass it through
  nativeTypes: [...OPENAI_NATIVE_TYPES, 'audio/wav'],
  // don't parse HTML; read it as plain text instead
  doclingTypes: Object.fromEntries(Object.entries(DOCLING_TYPES).filter(([t]) => t !== 'text/html')),
  plainTextTypes: (t) => isPlainTextType(t) || t === 'application/x-ndjson',
  doclingOptions: { ocr_lang: ['en', 'de'] },
});

// a model that reads images but not PDFs: PDFs are always parsed; low-confidence pages go as page images
doclingAttachments({ ...base, nativeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] });
```

The lower-level pieces are exported with TypeScript types: `convertWithDocling` (the docling-serve client),
`doclingToBlocks`, `pageBlocks` and `pageText` (a DoclingDocument -> text and image blocks).

## Supported documents

| Format | The model receives |
|---|---|
| PDF | text + tables + picture crops; low-confidence pages as images; all pages low: the original PDF |
| PNG, JPEG, WEBP | text + picture crops; low confidence (e.g. a photo): the original image |
| GIF | the original image (docling doesn't read GIF) |
| TIFF, BMP, multi-page TIFF | one PNG per page |
| Word (DOCX, DOC) | Markdown, lists, tables with merged cells, pictures, page header/footer once |
| PowerPoint (PPTX, PPT) | `[slide N]` markers, bullets, tables, **speaker notes**, **chart data as tables**, pictures |
| Excel (XLSX, XLS) | `## Sheet: name` + a table per data block, **chart data as tables** |
| OpenDocument (ODT, ODS, ODP), RTF, EPUB, HTML, CSV, AsciiDoc | Markdown, tables |
| Plain text: `text/*`, JSON, XML, YAML, TOML, code | the text itself, up to `maxTextChars` |
| Anything else (audio, video, email, archives) | a one-line note, so the request never fails |

DOC, PPT, XLS and RTF go through LibreOffice, which the image in `server/` adds.

<details>
<summary>What the model receives - real output for each type</summary>

**DOCX** - headings, tables and embedded pictures in reading order:
```
<document name="report.docx">
## Quarterly Report

Revenue grew 12% to 4.2M. The CEO is pictured below.

[image 1 (photograph)]
<image/png part, 104 KB>
Figure 1: Alan Turing, founder.

|Region|Sales|
|-|-|
|EU|1.9M|
|US|2.3M|
</document>
```

**PPTX** - slide numbers, speaker notes, the chart's own data:
```
[slide 1]
# Roadmap 2026
Product planning
Notes: Speaker note: open with the Q3 numbers.
...
[slide 4]
# Sales chart
[chart (bar chart)]
||Sales|
|-|-|
|North|42|
|South|17|
```

**XLSX** - sheet names, tables, chart data:
```
<document name="sales.xlsx">
## Sheet: Sales
|Region|Q1|Q2|
|-|-|-|
|EU|1900000|2100000|
[chart (bar chart): Revenue chart]
...
## Sheet: Notes
|Figures in USD, unaudited.|
</document>
```

**Scanned PDF**, confident (0.86) - OCR text with the photos as image parts:
```
<document name="scan.pdf" confidence="0.86">
## Alan Turing

Alan Mathison Turing (23 June 1912 - 7 June 1954) was an English mathematician, computer scientist ...
<image/png part, 104 KB>
Born ... 23 June 1912 Maida Vale, London, England ...
</document>
```

**Photo** - nothing to extract (confidence 0.00), so the model gets the image itself:
```
<document name="person.png" confidence="0.00">
<image/png part, 104 KB>
</document>
```

**Chart inside a PDF** - the picture plus the numbers docling read in it:
```
[image 3 (line chart): Figure 5: Prediction performance ... | text in image: 70 | mAP 0.50:0.95 | 65 | ... | % of DocLayNet training set | 20 | 40 | 60 | 80 | 100]
<image/png part>
```

**Unsupported type**:
```
[attachment "clip.mp4": this file type (video/mp4) can't be read]
```

</details>

**Pictures of people:** vision models describe people but won't identify them from their face. The caption and
the surrounding text carry the name, so they are always placed next to the image.

## Results

88 hard OmniDocBench pages (handwriting, tables, charts, irregular layouts, newspapers), read by `gpt-5-mini`.
Full comparison with docling alone, PyMuPDF4LLM and MarkItDown: [docs/COMPARISON.md](docs/COMPARISON.md).

![Parsing quality](docs/images/quality.png)

![Text error by page type](docs/images/by-page-type.png)

Neither source wins everywhere - docling is best on clean and dense print, vision on handwriting and layouts.
Routing by confidence takes the better one per page.

![Cost vs quality](docs/images/cost-vs-quality.png)

<details>
<summary>How the thresholds were chosen</summary>

![Confidence threshold](docs/images/confidence-threshold.png)

Docling's `low_score` ranged 0.67-0.96 on these pages; all pages where docling failed scored 0.85 or lower.
At 0.8, 40% of hard pages go to the model as images - clean documents score higher and stay text.

![Hint threshold](docs/images/hint-threshold.png)

In page mode, docling's text is added next to the image only on dense pages without tables. Anywhere between
2,500 and 6,000 characters gives the same result.

</details>

## Deployment

The image is the official docling-serve CPU release (`v1.35.0`) plus LibreOffice, with a build patch that returns
docling's per-page confidence (docling computes it; docling-serve only returned the document score). No GPU needed.
Size workers x threads to the machine's vCPUs with `DOCLING_WORKERS` and `DOCLING_THREADS`:

| Server | Workers x threads | Speed (measured) | Memory, idle / peak (measured) |
|---|---|---|---|
| 4 vCPU / 16 GB | 2 x 2 (default) | ~7 s per page, 2 documents in parallel | 0.8 GB / 3.6 GB |
| 2 vCPU / 8 GB | 1 x 2 | ~10 s per page, 1 document at a time | 0.8 GB / 2.7 GB |

The first conversion adds about 1.5 GB, each further parallel conversion about 1 GB; between requests memory stays
around 2 GB (the models stay loaded). Page images are rendered only when a page needs one, which cuts each response
by 80%; plain-text files skip docling entirely.

![Memory](docs/images/memory.png)

![Speed](docs/images/speed.png)

- **Avoid burstable CPU for steady traffic.** Sustained conversion drains CPU credits, after which a burstable
  instance runs at a fraction of its vCPUs. Use unlimited-credit mode or a fixed-performance instance.
- **ECS/Fargate:** build the image (`docker compose build`), push it to ECR, give the task the vCPU and memory
  above, and pass `DOCLING_API_KEY` from Secrets Manager. Keep the service in a private subnet; only the app
  should reach port 5001.
- **More than one app instance:** the parse cache is in-process (`cacheMB`); move it to Redis or blob storage,
  keyed by the same sha256, to share it.

**Security:** docling requires the API key, listens on localhost only, makes no outbound calls, and caps file size,
pages and queue length. The middleware never downloads user-supplied URLs (use `noServerDownloads` so the AI SDK
doesn't either), sanitizes file names, and never shows internal errors to the model.

## Limitations

- Docling on CPU takes seconds per page; long documents are cut at `maxPages`.
- Confidence is per page, not per picture: pictures always go to the model as images.
- The 0.8 threshold was calibrated on single pages; multi-page documents are routed page by page.
- Academic papers are a weak spot: some score just under 0.8 and go to vision, which reads them worse than
  docling did (0.15 vs 0.04 text error).
- Audio, video and email are out of scope (the model gets a note).

## Contributing

Issues and pull requests are welcome - see [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, commit style and
how to benchmark routing changes. Please report security issues privately ([SECURITY.md](SECURITY.md)). This
project follows a [code of conduct](CODE_OF_CONDUCT.md); changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Acknowledgements

Built on [docling](https://github.com/docling-project/docling) and
[docling-serve](https://github.com/docling-project/docling-serve), the [Vercel AI SDK](https://ai-sdk.dev), and
evaluated with [OmniDocBench](https://github.com/opendatalab/OmniDocBench).

## License

[MIT](LICENSE)
