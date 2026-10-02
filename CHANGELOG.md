# Changelog

## Unreleased

- The subscription usage dialog takes the host's backdrop blur alongside its translucent menu fill, the way the host's own stat dialog does. Without the blur the conversation behind the dialog stayed sharp enough to read through the panel.
- The Plugin Manager card and the Settings plugin inventory now show a
  localized title and description (`Subscription Hub` / `订阅中心`) instead
  of falling back to the English package description, and the plugin card
  shows a dedicated icon.

## v0.1.1 — 2026-10-01

- Settings shows the CLI version Codex and Claude present, with its source (npm latest / local CLI / built-in / configured), ported from upstream `f6e1b3f` so a failed npm lookup no longer reads as a plan limit.
- Renamed the npm package from `@goodboys-ai/dsh-subscription-hub` to `dsh-subscriptions`. Install with `dsh plugin --profile web add dsh-subscriptions`; if the old scoped package is installed, remove it first — installing both registers the same adapters twice and breaks plugin load. The GitHub repository moved to `goodboys-ai/dsh-subscriptions` (the old slug redirects); the scoped package was deprecated with a pointer to the new name.

## v0.1.0 — 2026-09-30

- First release. DSH support window and bounded peer range: see docs/compatibility.md.
- Published to npm as `@goodboys-ai/dsh-subscription-hub` (trusted publishing; prereleases on the alpha dist-tag).
