# Benchmarks

Everything behind the numbers and charts in the [README](../README.md) and [docs/COMPARISON.md](../docs/COMPARISON.md).
Nothing here is published to npm. Inputs, predictions and scores go to `bench/data/` (git-ignored).

```
docker/    evaluator (OmniDocBench, pinned), PyMuPDF4LLM and MarkItDown images
scripts/   page selection, one runner per method, routing, scoring, speed, memory, Office checks
charts/    matplotlib charts -> docs/images/
```

All commands run from the repository root. Anything that talks to docling or OpenAI needs `.env`, so run it
through `dotenvx run --`, with docling-serve up (`dotenvx run -- docker compose up -d`).

## Methods

| Method (`data/pred/<method>`) | What it is | Produced by |
|---|---|---|
| `docling` | docling-serve Markdown, no LLM | `scripts/docling.ts` |
| `vision` | page image -> `gpt-5-mini` | `scripts/llm.ts vision` |
| `hybrid` | page image + docling text as a hint -> `gpt-5-mini` | `scripts/llm.ts hybrid` |
| `pages` | the middleware's page mode: `hybrid` on dense pages without tables, else `vision` | `scripts/route.ts` |
| `default` | the middleware's default: `docling`, or `pages` below `minConfidence` | `scripts/route.ts` |
| `vision-gpt-5-nano` | `vision` with `gpt-5-nano` | `scripts/llm.ts vision gpt-5-nano` |
| `pymupdf-tesseract`, `pymupdf-rapidocr` | PyMuPDF4LLM | `scripts/pymupdf.py` |
| `markitdown-ocr` | MarkItDown + OCR plugin (`gpt-5-mini`) | `scripts/markitdown.py --ocr` |

`route.ts` spends no tokens: it applies the middleware's own rules (`pageText`, `minConfidence`) to saved outputs,
so thresholds can be re-tested for free.

## Hard pages (OmniDocBench)

```bash
# 1. data: OmniDocBench v1.6 (images/ and OmniDocBench.json) from https://huggingface.co/datasets/opendatalab/OmniDocBench
#    into bench/data/OmniDocBench/, then pick the 88 hard pages
python bench/scripts/select_pages.py

# 2. images
docker build -t omnidocbench-eval -f bench/docker/eval.Dockerfile bench/docker
docker build -t pymupdf4llm-bench -f bench/docker/pymupdf.Dockerfile bench/docker
docker build -t markitdown-bench -f bench/docker/markitdown.Dockerfile bench/docker

# 3. predictions (resumable: finished pages are skipped)
dotenvx run -- node bench/scripts/docling.ts
dotenvx run -- node bench/scripts/llm.ts vision          # ~88 gpt-5-mini calls
dotenvx run -- node bench/scripts/llm.ts hybrid
node bench/scripts/route.ts                              # pages + default, no LLM calls
docker run --rm -v "$PWD/bench/data:/data" -v "$PWD/bench/scripts:/scripts" pymupdf4llm-bench python /scripts/pymupdf.py --ocr rapidocr
dotenvx run -- sh -c 'docker run --rm -e OPENAI_API_KEY -v "$PWD/bench/data:/data" -v "$PWD/bench/scripts:/scripts" markitdown-bench python /scripts/markitdown.py --ocr'

# 4. scores -> bench/data/results/
bash bench/scripts/score.sh docling vision hybrid pages default pymupdf-rapidocr markitdown-ocr
```

On Windows (Git Bash) prefix `docker run` with `MSYS_NO_PATHCONV=1` and use `$(pwd -W)` instead of `$PWD`.

## Word, PowerPoint and Excel

```bash
dotenvx run -- node bench/scripts/office.ts
FIX="$PWD/test/fixtures:/fixtures"
docker run --rm -v "$PWD/bench/data:/data" -v "$FIX" -v "$PWD/bench/scripts:/scripts" markitdown-bench python /scripts/markitdown.py --office
dotenvx run -- sh -c 'docker run --rm -e OPENAI_API_KEY -v "$PWD/bench/data:/data" -v "'"$FIX"'" -v "$PWD/bench/scripts:/scripts" markitdown-bench python /scripts/markitdown.py --ocr --office'
docker run --rm -v "$PWD/bench/data:/data" -v "$FIX" -v "$PWD/bench/scripts:/scripts" pymupdf4llm-bench python /scripts/pymupdf.py --office
python bench/scripts/office_checks.py
```

## Speed and memory

```bash
docker update --cpus 4 --memory 16g ai-sdk-docling-docling-1
dotenvx run -- node bench/scripts/speed.ts 4vcpu
dotenvx run -- bash bench/scripts/memory.sh 4vcpu 4 16g 2
dotenvx run -- bash bench/scripts/memory.sh 2vcpu 2 8g 1
```

## Charts

```bash
docker run --rm -v "$PWD/bench:/bench" -v "$PWD/docs/images:/images" -w /bench/charts omnidocbench-eval python readme.py
docker run --rm -v "$PWD/bench:/bench" -v "$PWD/docs/images:/images" -w /bench/charts omnidocbench-eval python compare.py
```
