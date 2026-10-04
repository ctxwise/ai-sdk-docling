# Contributing

Thanks for helping. Bug reports, benchmark results on your own documents and pull requests are all welcome.

## Before you start

- **Bugs:** open an [issue](../../issues/new/choose) with the file type, the options you passed and what the model
  received (the middleware's output, not the model's answer). A small file that reproduces it helps most.
- **Routing changes** (what goes to the model as text or as an image) belong to the docling server:
  [ctxwise/docling-serve](https://github.com/ctxwise/docling-serve), where the benchmarks live.
- **Security issues:** don't open an issue; see [SECURITY.md](SECURITY.md).

## Setup

Requirements: Node 24 (tests run TypeScript directly), Docker, and [dotenvx](https://dotenvx.com) for secrets.

```bash
git clone https://github.com/ctxwise/ai-sdk-docling.git
cd ai-sdk-docling
npm install
cp .env.example .env
dotenvx set DOCLING_API_KEY "$(openssl rand -hex 24)"
# docling-serve on 127.0.0.1:5001, from https://github.com/ctxwise/docling-serve (ctxwise/docker-compose.yml)
```

Run anything that needs `.env` through `dotenvx run --`.

## Project layout

| Path | What |
|---|---|
| `src/` | the package: `middleware.ts` (routing), `docling.ts` (docling-serve client), `media.ts` (type tables), `constants.ts` (option values), `cache.ts` |
| `test/unit/` | offline tests, run in CI |
| `test/integration/` | tests against a live docling-serve (skipped when it isn't running); one real OpenAI call when `OPENAI_API_KEY` is set |
| `test/fixtures/` | the documents the tests use |
| `examples/` | runnable usage examples, type-checked in CI |

## Checks

```bash
npm run lint                               # Biome: lint + format check (npm run format to fix)
npm run typecheck                          # src, tests, examples
npm test                                   # unit tests, offline
dotenvx run -- npm run test:integration    # needs docling-serve (~10 min)
npm run build                              # dist/
```

CI runs Biome, typecheck, unit tests, build and `npm pack --dry-run` on every push and pull request. Please run the
integration tests yourself when you touch `src/`.

## Code style

- Formatting is Biome's; don't hand-format. Beyond that, match the surrounding
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
| `chore` | tooling, housekeeping |
| `build` | package build, Docker image |
| `ci` | GitHub Actions |
| `style` | formatting only |
| `revert` | reverting a commit |

Example: `fix: keep the original image when docling finds no text`

## Diagrams

README diagrams are images, because npm doesn't render Mermaid. Edit the sources in `docs/diagrams/*.mmd`, then
regenerate the PNGs:

```bash
for n in how-it-works vision-model; do
  docker run --rm -u root -v "$PWD/docs:/data" ghcr.io/mermaid-js/mermaid-cli/mermaid-cli -i /data/diagrams/$n.mmd -o /data/images/$n.png -c /data/diagrams/theme.json -b "#fcfcfb" -s 2
done
```

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please); nobody edits the
version or the changelog by hand.

1. Commits on `main` (in the format above) keep a **release pull request** open, with the next version and the
   generated CHANGELOG.md entry.
2. The version comes from the commits since the last release: `feat:` bumps the minor; `fix:`, `perf:`, `docs:`,
   `build:` and `revert:` the patch; a breaking change (`feat!:` or a `BREAKING CHANGE:` footer) the major - the
   minor while the version is below 1.0. `refactor`, `test`, `chore`, `ci` and `style` commits are left out of the
   changelog and never trigger a release on their own.
   Nothing is approved or merged automatically: a maintainer reviews and merges the release pull request.
3. Merging the release pull request tags `vX.Y.Z`, creates the GitHub release, and publishes to npm
   (`.github/workflows/release.yml`, once publishing is enabled).
