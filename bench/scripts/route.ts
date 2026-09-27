// Assembles the middleware's modes from saved outputs, with the middleware's own rules. Zero LLM calls.
//   pages   = page image, plus docling text as a hint where pageText() says so (hybrid, else vision)
//   default = docling text, or 'pages' for pages whose docling confidence < minConfidence
// Needs data/pred/{docling,vision,hybrid} and data/docling-json. Writes data/pred/{pages,default}.
// usage: node bench/scripts/route.ts [minConfidence=0.8]
import { copyFileSync, readFileSync } from 'node:fs';
import { DEFAULTS, pageText } from '../../src/index.ts';
import { DATA, pages, predDir, stem } from './common.ts';

const minConfidence = Number(process.argv[2] ?? DEFAULTS.minConfidence);
const dir = (m: string) => `${DATA}/pred/${m}`;
const [pagesOut, defaultOut] = [predDir('pages'), predDir('default')];

let hints = 0, low = 0;
const names = pages();
for (const name of names) {
  const { confidence, doc } = JSON.parse(readFileSync(`${DATA}/docling-json/${name}.json`, 'utf8'));
  const md = `${stem(name)}.md`;
  const { hint } = pageText(doc, 1, DEFAULTS.denseChars);
  copyFileSync(`${dir(hint ? 'hybrid' : 'vision')}/${md}`, `${pagesOut}/${md}`);
  const score: number = confidence.pages?.['1'] ?? confidence.low_score; // single-page items
  copyFileSync(score < minConfidence ? `${pagesOut}/${md}` : `${dir('docling')}/${md}`, `${defaultOut}/${md}`);
  hints += +!!hint;
  low += +(score < minConfidence);
}
console.log(`pages: ${hints}/${names.length} with a docling hint; default: ${low}/${names.length} pages below ${minConfidence} sent to the LLM`);
