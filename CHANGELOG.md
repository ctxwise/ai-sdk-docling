# Changelog

All notable changes to this project. Versions follow [Semantic Versioning](https://semver.org); entries are
generated from [Conventional Commits](https://www.conventionalcommits.org) by
[release-please](https://github.com/googleapis/release-please) when a release pull request is merged.

## [0.1.0](https://github.com/uditkumar01/ai-sdk-docling/releases/tag/v0.1.0) (2026-09-27)

### Added

- `doclingAttachments` middleware for the Vercel AI SDK: attachments parsed by docling-serve; pictures and pages
  docling reads unreliably (per-page confidence below `minConfidence`) go to the model as images.
- Modes per PDF and image: `'docling'` (hybrid, default), `'pages'`, `'native'`.
- Optional `visionModel` that turns images into text for the main model.
- Configurable limits and file types: `DEFAULTS`, `doclingTypes`, `plainTextTypes`, `nativeTypes`, `doclingOptions`, `onError`.
- Lower-level API: `convertWithDocling`, `doclingToBlocks`, `pageBlocks`, `pageText`.
- docling-serve image with LibreOffice (DOC, XLS, PPT, RTF) and per-page confidence.
- OmniDocBench, Office, speed and memory benchmarks, and a comparison with PyMuPDF4LLM and MarkItDown.
