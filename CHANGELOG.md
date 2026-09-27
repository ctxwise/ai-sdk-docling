# Changelog

All notable changes to this project. Versions follow [Semantic Versioning](https://semver.org); entries are
generated from [Conventional Commits](https://www.conventionalcommits.org) by
[release-please](https://github.com/googleapis/release-please) when a release pull request is merged.

## [0.1.2](https://github.com/ctxwise/ai-sdk-docling/compare/v0.1.1...v0.1.2) (2026-09-27)


### Reverts

* drop the optional release-please token ([abfaa62](https://github.com/ctxwise/ai-sdk-docling/commit/abfaa6273890cec74e78f2e5ab41b17c1122466c))


### Documentation

* point links to the ctxwise organization ([097f284](https://github.com/ctxwise/ai-sdk-docling/commit/097f284590307aadd2bd6075a3838201359e8a74))


### Build

* publish as @ctxwise/ai-sdk-docling ([ed1cce3](https://github.com/ctxwise/ai-sdk-docling/commit/ed1cce35ae640491dff8a22852e661bb00bf1ae8))

## [0.1.1](https://github.com/ctxwise/ai-sdk-docling/compare/v0.1.0...v0.1.1) (2026-09-27)


### Bug Fixes

* fail at setup with a clear error when the docling url is missing ([cecca32](https://github.com/ctxwise/ai-sdk-docling/commit/cecca3281d87c0e431399e78ae2119f6f205c195))
* pin ruff-action to v4.1.0, it has no v4 tag ([a45d6a7](https://github.com/ctxwise/ai-sdk-docling/commit/a45d6a79b2164b117e1ac3c40bbeaf41ffdddb68))


### Documentation

* add contributing guide, security policy, code of conduct, changelog and issue templates ([d7ee1ad](https://github.com/ctxwise/ai-sdk-docling/commit/d7ee1ad6436959a85b81bc359c3bcb50729a4f27))
* add runnable, type-checked usage examples ([d7bfa59](https://github.com/ctxwise/ai-sdk-docling/commit/d7bfa596f5b9cbfa02b9c215ecced46cc3839c15))
* document the release process and generated changelog ([e7fd4b3](https://github.com/ctxwise/ai-sdk-docling/commit/e7fd4b32f87724264f6a2457a1f73638941c5fa2))
* lint and format commands in the contributing guide ([56121da](https://github.com/ctxwise/ai-sdk-docling/commit/56121da378081d614f5064659517923f56fda91b))
* name the default preset as the hybrid approach and when page mode is worth it ([af9cb05](https://github.com/ctxwise/ai-sdk-docling/commit/af9cb05d1d54e19d50a254e7f34000f3b80cb93f))
* professional readme with badges, features and example gallery ([7e62223](https://github.com/ctxwise/ai-sdk-docling/commit/7e62223e5569a05905bdbe617f31fb203b61efd3))
* rewrite readme around quick start, the hybrid flow and choosing models ([03f96d1](https://github.com/ctxwise/ai-sdk-docling/commit/03f96d1337dde25e329a7fa96af3ed23abd48605))


### Build

* add biome for typescript and ruff for python ([99d2159](https://github.com/ctxwise/ai-sdk-docling/commit/99d2159bf202a2f0631ecb06405e291f177f7667))
* pin @types/node to the oldest supported node ([8701c15](https://github.com/ctxwise/ai-sdk-docling/commit/8701c1555e2dfb5a78f061077731bd8537f62ffd))
* require node 22 or newer, node 20 is end-of-life ([400edaf](https://github.com/ctxwise/ai-sdk-docling/commit/400edafc823db84c453c0f259820fe34677fd262))
* update ai to 7.0.117 ([fde0470](https://github.com/ctxwise/ai-sdk-docling/commit/fde0470d419d9a78ea4829ba2a71680a1e6a4028))

## [0.1.0](https://github.com/ctxwise/ai-sdk-docling/releases/tag/v0.1.0) (2026-09-27)

### Added

- `doclingAttachments` middleware for the Vercel AI SDK: attachments parsed by docling-serve; pictures and pages
  docling reads unreliably (per-page confidence below `minConfidence`) go to the model as images.
- Modes per PDF and image: `'docling'` (hybrid, default), `'pages'`, `'native'`.
- Optional `visionModel` that turns images into text for the main model.
- Configurable limits and file types: `DEFAULTS`, `doclingTypes`, `plainTextTypes`, `nativeTypes`, `doclingOptions`, `onError`.
- Lower-level API: `convertWithDocling`, `doclingToBlocks`, `pageBlocks`, `pageText`.
- docling-serve image with LibreOffice (DOC, XLS, PPT, RTF) and per-page confidence.
- OmniDocBench, Office, speed and memory benchmarks, and a comparison with PyMuPDF4LLM and MarkItDown.
