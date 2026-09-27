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
npm run lint                               # Biome: lint + format check (npm run format to fix)
uvx ruff check . && uvx ruff format .      # Ruff: the Python in bench/ and server/
npm run typecheck                          # src, tests, examples, bench scripts
npm test                                   # unit tests, offline
dotenvx run -- npm run test:integration    # needs docling-serve (~10 min)
npm run build                              # dist/
```

CI runs Biome, Ruff, typecheck, unit tests, build and `npm pack --dry-run` on every push and pull request. Please run the
integration tests yourself when you touch `src/`.

## Code style

- Formatting is Biome's (TypeScript) and Ruff's (Python); don't hand-format. Beyond that, match the surrounding
  code: small functions, comments that say *why*, no dead code.
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

Releases are automated with [release-please](https://github.com/googleapis/release-please); nobody edits the
version or the changelog by hand.

1. Commits on `main` (in the format above) keep a **release pull request** open, with the next version and the
   generated CHANGELOG.md entry.
2. The version comes from the commits since the last release: `feat:` bumps the minor; `fix:`, `perf:`, `docs:`,
   `build:` and `revert:` the patch; a breaking change (`feat!:` or a `BREAKING CHANGE:` footer) the major - the
   minor while the version is below 1.0. `refactor`, `test`, `chore`, `ci` and `style` commits are left out of the
   changelog and never trigger a release on their own.
3. Merging the release pull request tags `vX.Y.Z`, creates the GitHub release, and publishes to npm
   (`.github/workflows/release.yml`, once publishing is enabled).
