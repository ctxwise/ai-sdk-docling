// Benchmark pages -> Markdown by an OpenAI vision model: the page image alone ('vision'), or with docling's
// Markdown as a hint ('hybrid'; needs data/pred/docling from docling.ts).
// Writes data/pred/<mode>[-<model>]/<page>.md.
// usage: dotenvx run -- node bench/scripts/llm.ts <vision|hybrid> [model=gpt-5-mini]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { DATA, pageImage, pages, pool, predDir, stem, todo } from './common.ts';

const [mode = 'vision', model = 'gpt-5-mini'] = process.argv.slice(2);
if (mode !== 'vision' && mode !== 'hybrid') throw new Error('mode must be vision or hybrid');
const out = predDir(model === 'gpt-5-mini' ? mode : `${mode}-${model}`);

const PROMPT = `Convert this document page to Markdown.
- Follow the natural reading order (columns, sidebars, captions in place).
- Tables as HTML <table> (use rowspan/colspan for merged cells).
- Math as LaTeX: inline $...$, display $$...$$.
- Transcribe handwriting as text.
- For charts/photos/illustrations write nothing, except text printed inside them that is part of the content.
- Skip page headers, footers and page numbers.
Output only the Markdown.`;

const names = todo(pages(), out);
console.log(`${mode}/${model}: ${names.length} pages to do`);
let tokensIn = 0,
  tokensOut = 0,
  failed = 0;
await pool(names, 8, async (name) => {
  const doclingMd = `${DATA}/pred/docling/${stem(name)}.md`;
  const hint =
    mode === 'hybrid' && existsSync(doclingMd)
      ? `Text extracted by a layout parser (reading order and tables may be wrong; the image is the ground truth):\n<parser>\n${readFileSync(doclingMd, 'utf8')}\n</parser>`
      : '';
  try {
    const r = await generateText({
      model: openai(model),
      providerOptions: { openai: { reasoningEffort: 'low' } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            ...(hint ? [{ type: 'text' as const, text: hint }] : []),
            { type: 'file', mediaType: 'image/jpeg', data: pageImage(name) },
          ],
        },
      ],
    });
    writeFileSync(`${out}/${stem(name)}.md`, r.text.replace(/^```(?:markdown)?\n|\n```$/g, ''));
    tokensIn += r.usage.inputTokens ?? 0;
    tokensOut += r.usage.outputTokens ?? 0;
  } catch (e) {
    failed++;
    console.log('FAIL', name, (e as Error).message.slice(0, 200));
  }
});
console.log(
  `failed ${failed}; tokens in ${tokensIn} out ${tokensOut} (${Math.round(tokensIn / Math.max(names.length - failed, 1))} in/page)`,
);
