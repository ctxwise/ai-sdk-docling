// docling processing time and response size per server size: 1 warm-up + 3 runs, median (server-side processing_time).
// Compares rendering every page image up front with the current request (page images only when needed).
// Limit the container first, e.g. docker update --cpus 4 --memory 16g ai-sdk-docling-docling-1
// usage: dotenvx run -- node bench/scripts/speed.ts <label, e.g. 4vcpu>   -> data/speed-<label>.json
import { readFileSync, writeFileSync } from 'node:fs';
import { convertWithDocling } from '../../src/index.ts';
import { DATA, DOCLING } from './common.ts';

const label = process.argv[2] ?? 'local';
const base = { to_formats: 'json', image_export_mode: 'embedded', ocr_preset: 'rapidocr', do_picture_classification: 'true' };
const combos: Record<string, Record<string, string>> = { 'all-pages': { include_page_images: 'true' }, 'on-demand': {} };
const files: Record<string, number> = { 'docling-paper.pdf': 9, 'scan.pdf': 2 }; // name -> pages

const runs: Record<string, Record<string, { seconds: number[]; mb: number[] }>> = {};
for (let rep = 0; rep < 4; rep++) {
  for (const f of Object.keys(files)) {
    for (const [combo, extra] of Object.entries(combos)) {
      const bytes = readFileSync(`test/fixtures/${f}`);
      const { response } = await convertWithDocling(bytes, f, { ...DOCLING, timeoutMs: 900_000, options: { ...base, ...extra } });
      if (rep === 0) continue; // warm-up
      const r = ((runs[f] ??= {})[combo] ??= { seconds: [], mb: [] });
      r.seconds.push(response.processing_time);
      r.mb.push(JSON.stringify(response).length / 2 ** 20);
    }
  }
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const out: Record<string, any> = {};
for (const [f, byCombo] of Object.entries(runs)) {
  out[f] = { pages: files[f] };
  for (const [combo, r] of Object.entries(byCombo)) {
    out[f][combo] = { seconds: median(r.seconds), mb: median(r.mb), runs: r.seconds };
    console.log(`${label} ${f.padEnd(18)} ${combo}  ${median(r.seconds).toFixed(1)}s  ${(median(r.seconds) / files[f]).toFixed(1)}s/page  ${median(r.mb).toFixed(1)} MB`);
  }
}
writeFileSync(`${DATA}/speed-${label}.json`, JSON.stringify(out, null, 1));
