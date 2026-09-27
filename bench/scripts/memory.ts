// Drives docling through load phases while memory.sh samples container memory; writes the phase timestamps.
// usage: via memory.sh   -> data/mem-<label>-phases.json
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { convertWithDocling } from '../../src/index.ts';
import { DATA, DOCLING } from './common.ts';

const label = process.argv[2] ?? 'local';
const convert = (f: string) =>
  convertWithDocling(readFileSync(`test/fixtures/${f}`), f, {
    ...DOCLING,
    timeoutMs: 900_000,
    options: { to_formats: 'json', image_export_mode: 'embedded', ocr_preset: 'rapidocr', do_picture_classification: 'true' },
  });

const phases: { name: string; start: number; end: number }[] = [];
async function phase(name: string, fn: () => Promise<unknown>) {
  const start = Date.now() / 1000;
  await fn();
  phases.push({ name, start, end: Date.now() / 1000 });
  console.log(`${name}: ${(Date.now() / 1000 - start).toFixed(0)}s`);
}
await phase('idle', () => wait(20_000));
await phase('1 PDF (9 pages)', () => convert('docling-paper.pdf'));
await phase('idle 2', () => wait(15_000));
await phase('4 docs at once', () => Promise.all(['docling-paper.pdf', 'scan.pdf', 'newspaper.jpg', 'report.docx'].map(convert)));
await phase('idle 3', () => wait(15_000));
await phase('legacy .doc + .xls (LibreOffice)', () => Promise.all(['legacy-table.doc', 'legacy.xls'].map(convert)));
await phase('idle 4', () => wait(15_000));
writeFileSync(`${DATA}/mem-${label}-phases.json`, JSON.stringify(phases, null, 1));
