# Contributing

Thanks for helping. Bug reports, benchmark results on your own documents and pull requests are all welcome.

## Before you start

- **Bugs:** open an [issue](../../issues/new/choose) with the file type, the options you passed and what the model
  received (the middleware's output, not the model's answer). A small file that reproduces it helps most.
- **Features and routing changes:** open an issue first. Routing rules here are measured, so a change to them
  should come with numbers (see [Benchmarks](#benchmarks)).
- **Security issues:** don't open an issue; see [SECURITY.md](SECURITY.md).

## Setup

Requirements: Node 24 (tests run TypeScript directly), Docker, and [dotenvx](https://dotenvx.com) for secrets.

```bash
git clone https://github.com/uditkumar01/ai-sdk-docling.git
cd ai-sdk-docling
npm install
cp .env.example .env
dotenvx set DOCLING_API_KEY "$(openssl rand -hex 24)"
dotenvx run -- docker compose up -d --build     # docling-serve on localhost:5001
```

Run anything that needs `.env` through `dotenvx run --`.

## Project layout

| Path | What |
|---|---|
| `src/` | the package: `middleware.ts` (routing), `docling.ts` (docling-serve client), `blocks.ts` (document -> text and image blocks), `media.ts` (type tables), `cache.ts` |
| `test/unit/` | offline tests, run in CI |
| `test/integration/` | tests against a live docling-serve (skipped when it isn't running); one real OpenAI call when `OPENAI_API_KEY` is set |
| `test/fixtures/` | the documents the tests use |
| `examples/` | runnable usage examples, type-checked in CI |
| `server/` | the docling-serve image |
| `bench/` | benchmark scripts, see [bench/README.md](bench/README.md) |

## Checks

```bash
npm run typecheck                          # src, tests, examples, bench scripts
npm test                                   # unit tests, offline
dotenvx run -- npm run test:integration    # needs docling-serve (~10 min)
npm run build                              # dist/
```

CI runs typecheck, unit tests, build and `npm pack --dry-run` on every push and pull request. Please run the
integration tests yourself when you touch `src/`.

## Code style

- Match the surrounding code: small functions, comments that say *why*, no dead code.
- No new runtime dependencies. `ai` and `@ai-sdk/provider` are peer dependencies; everything else is Node's standard library.
- New options get a JSDoc comment with `@default`, an entry in `DEFAULTS`, a row in the README configuration
  tables, and a test.
- Public API changes need a [CHANGELOG.md](CHANGELOG.md) entry.

## Commits

One-line [Conventional Commits](https://www.conventionalcommits.org): `<type>: <message>`, lower case, imperative.

| Type | For |
|---|---|
| `feat` | a new feature or option |
| `fix` | a bug fix |
| `refactor` | code change without behavior change |
| `perf` | faster or cheaper |
| `docs` | README, docs, comments |
| `test` | tests and fixtures |
| `chore` | tooling, benchmarks, housekeeping |
| `build` | package build, Docker image |
| `ci` | GitHub Actions |
| `style` | formatting only |
| `revert` | reverting a commit |

Example: `fix: keep the original image when docling finds no text`

## Benchmarks

Changes to routing (`minConfidence`, `denseChars`, what goes as an image) should show their effect on the
OmniDocBench hard pages. Most routing experiments cost no tokens: `bench/scripts/route.ts` re-applies the
middleware's rules to saved outputs. Include the before/after table from `bench/scripts/score.sh` in the pull request.

## Releases

Maintainers only: update `CHANGELOG.md`, bump `version` in `package.json`, tag `vX.Y.Z`, then `npm publish`
(`prepublishOnly` runs typecheck, tests and build).
