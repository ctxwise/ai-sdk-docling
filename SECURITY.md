# Security policy

## Supported versions

Only the latest release gets security fixes.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through
[GitHub security advisories](../../security/advisories/new) with the affected version, the options used, and
steps or a file to reproduce it. You'll get an answer within a week; fixed issues are credited in the release
notes unless you prefer otherwise.

## Scope

This package handles untrusted files and messages from chat users. In scope, for example:

- the middleware fetching a URL it shouldn't (it never downloads user-supplied URLs unless `fetchUrls: true`)
- a file name or document content breaking out of the `<document>` wrapper
- internal errors, paths or hosts reaching the model
- limits (`maxFileBytes`, `maxPages`, `timeoutMs`, `cacheMB`) that can be bypassed

The server image and its compose file live in [ctxwise/docling-serve](https://github.com/ctxwise/docling-serve);
report problems with that setup there. Vulnerabilities in docling or docling-serve themselves belong to the
[docling project](https://github.com/docling-project/docling-serve/security).

## Deployment checklist

- Keep docling-serve private: bound to localhost or a private subnet, API key set (`DOCLING_API_KEY`).
- Pass `experimental_download: noServerDownloads` to `streamText`/`generateText` so the AI SDK doesn't fetch user URLs.
- Leave `fetchUrls` off.
- Keep secrets out of the repository; this project uses `dotenvx` with an encrypted `.env`.
