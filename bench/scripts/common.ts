import { existsSync, mkdirSync, readFileSync } from 'node:fs';

/** bench/data, as a path relative to the repository root (scripts run from there) */
export const DATA = 'bench/data';
export const DOCLING = { url: process.env.DOCLING_URL ?? 'http://localhost:5001', apiKey: process.env.DOCLING_API_KEY };

/** benchmark page image names (data/hard.txt, from select_pages.py) */
export const pages = (list = `${DATA}/hard.txt`) =>
  readFileSync(list, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
export const pageImage = (name: string) => readFileSync(`${DATA}/OmniDocBench/images/${name}`);
export const stem = (name: string) => name.replace(/\.\w+$/, '');

/** data/pred/<method>/ (created), where the evaluator reads <page>.md */
export function predDir(method: string) {
  const dir = `${DATA}/pred/${method}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** items whose output file doesn't exist yet (every script is resumable); default output: <dir>/<page>.md */
export const todo = (names: string[], out: string | ((name: string) => string)) =>
  names.filter((n) => !existsSync(typeof out === 'string' ? `${out}/${stem(n)}.md` : out(n)));

/** runs `fn` over `items` with `concurrency` in flight, logging progress */
export async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const t0 = Date.now();
  let done = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        await fn(queue.shift()!);
        if (++done % 10 === 0)
          console.log(`${done}/${items.length}  ${((Date.now() - t0) / 1000 / done).toFixed(1)}s/item`);
      }
    }),
  );
  console.log(`${done} done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
