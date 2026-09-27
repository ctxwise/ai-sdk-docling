// Office comparison, this project's side: exactly what the model receives for test/fixtures/rich.{docx,pptx,xlsx}
// (image parts written as `![image part](<type>)`). Writes data/office/docling-rich.<ext>.md; score with office_checks.py.
// usage: dotenvx run -- node bench/scripts/office.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { generateText, wrapLanguageModel } from 'ai';
import { doclingAttachments } from '../../src/index.ts';
import { mockModel, T } from '../../test/helpers.ts';
import { DATA, DOCLING } from './common.ts';

mkdirSync(`${DATA}/office`, { recursive: true });
for (const ext of ['docx', 'pptx', 'xlsx'] as const) {
  const model = mockModel();
  const middleware = doclingAttachments({ ...DOCLING, cacheMB: 0 });
  const data = readFileSync(`test/fixtures/rich.${ext}`);
  await generateText({
    model: wrapLanguageModel({ model, middleware }),
    messages: [{ role: 'user', content: [{ type: 'file', data, mediaType: T[ext], filename: `rich.${ext}` }] }],
  });
  const parts = model.doGenerateCalls[0].prompt.find((m) => m.role === 'user')!.content as any[];
  const md = parts.map((p) => (p.type === 'text' ? p.text : `\n![image part](${p.mediaType})\n`)).join('\n');
  writeFileSync(`${DATA}/office/docling-rich.${ext}.md`, md);
  console.log(`rich.${ext}: ${md.length} chars`);
}
