# Changelog

## Unreleased

- Settings shows the CLI version Codex and Claude present, with its source (npm latest / local CLI / built-in / configured), ported from upstream `f6e1b3f` so a failed npm lookup no longer reads as a plan limit.
- Renamed the npm package from `@goodboys-ai/dsh-subscription-hub` to `dsh-subscriptions`. Install with `dsh plugin --profile web add dsh-subscriptions`; if the old scoped package is installed, remove it first — installing both registers the same adapters twice and breaks plugin load. The GitHub repository moved to `goodboys-ai/dsh-subscriptions` (the old slug redirects); the old scoped package name will be deprecated in favor of the new one.

## v0.1.0 — 2026-09-30

- First release. DSH support window and bounded peer range: see docs/compatibility.md.
- Published to npm as `@goodboys-ai/dsh-subscription-hub` (trusted publishing; prereleases on the alpha dist-tag).
