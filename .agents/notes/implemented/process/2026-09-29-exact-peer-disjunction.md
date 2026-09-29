# Agent Note: Exact-version peer disjunction

Status: implemented

## Problem

DSH is a fast-moving developer preview: every release so far has been a
prerelease (`-alpha`, `-rc`) and breaking changes are routine. One plugin
release must install on every DSH version in the support window (see
`dsh-versions.txt`), but the `@deepseek-ai/*` peerDependencies must not
promise compatibility with DSH versions the gate has never seen.

## Decision

The six `@deepseek-ai/*` peers are an **exact-version disjunction**
(currently `0.1.7-rc.2 || 0.2.0-rc.1`), not a range and not an exact pin. A
disjunct is appended only after the full gate (build + test suite + L1 + L2)
goes green on that DSH version, and removed when the window drops it — so
the disjunction always lists exactly the gated versions, no more. The
`devDependencies` stay pinned exact at the window floor, so the build never
uses APIs newer than the oldest supported DSH.

DSH's plugin manager enforces peer versions at install time but accepts
disjunctions. Verified: with exact `0.1.7-rc.2` peers, installing on
`0.2.0-rc.1` is *rejected* unless the user grants an explicit
`dsh plugin allow-version` exemption; with the disjunction, the same packed
tarball installs cleanly on both versions, and `@deepseek-ai/*` resolves
from the host at runtime (the tarball ships no `node_modules`).

## Alternatives considered

- **Exact pin + per-DSH-line releases.** The pre-0.2 status quo. Doubles
  release work for every DSH minor line and forces users to pick the right
  plugin line for their DSH. Rejected once the disjunction was verified to
  install across the window from a single artifact.
- **Wide range (`>=0.1.7-rc.2 <0.3.0`).** Admits future versions such as
  `0.2.1-rc.1` that the gate has never seen — promising more than verified.
  A range silently extends the promise every time DSH ships; a disjunction
  forces a conscious, gated decision per version. Rejected on review.
- **`dsh plugin allow-version` exemption.** A user-side escape hatch for
  installing despite a peer mismatch. Useful for experimenting, not a
  distribution strategy — it pushes version judgment onto every user.

## Consequences

One release installs across the whole window, and the plugin version no
longer tracks DSH minor lines. The cost: the disjunction is a promise, and
extending it requires running the full gate on the new DSH version first —
a new RC is supported by process (detect → gate → append → tag), never by
optimism.
