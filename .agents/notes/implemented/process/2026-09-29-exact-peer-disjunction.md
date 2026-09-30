# Agent Note: Exact-version peer disjunction

Status: implemented

> Superseded by [2026-09-30 Bounded peer range](2026-09-30-bounded-peer-range.md):
> the six peers moved from an exact-version disjunction to a bounded range
> (`>=0.1.7-rc.2 <0.3.0-0`). This note survives as the record of the original
> decision; its core argument — a peer declaration is an install-time-enforced
> promise — still stands and is why the range keeps both bounds.

## Problem

DSH is a fast-moving developer preview: every release so far has been a
prerelease (`-alpha`, `-rc`) and breaking changes between versions are
routine. One plugin release must install on every DSH version in the support
window (`dsh-versions.txt` — `0.1.7-rc.2`, `0.2.0-rc.1`, and `0.2.0-rc.2` at
the time this note was superseded), but the `@deepseek-ai/*`
peerDependencies must not promise compatibility with DSH versions the
compatibility gate has never seen. A peer declaration is a promise the
package manager enforces at install time; an overbroad promise ships broken
installs, an overnarrow one rejects working ones.

## Decision

The six DSH peers — `@deepseek-ai/dsh-attachment`, `dsh-credentials`,
`dsh-home-paths`, `dsh-llm`, `dsh-tools`, `dsh-web` — are declared as an
**exact-version disjunction** (`0.1.7-rc.2 || 0.2.0-rc.2`), not a range and
not an exact pin. Two companion rules keep the disjunction honest:

- A disjunct reaches `main` only after the full gate (build, test suite,
  host-export and host contract checks, boot smoke, host E2E) goes green on that DSH version, and
  is removed when the support window drops it. The PR that adds the version
  to `dsh-versions.txt` adds the disjunct too, because the boot smoke cannot install the
  tarball on a DSH version its peers reject; that PR merges only when green.
  The disjunction on `main` therefore lists exactly the gated versions — no
  more, no fewer.
- `devDependencies` stay pinned **exact at the window floor** (`0.1.7-rc.2`),
  so the build never uses APIs newer than the oldest supported DSH. Only
  packages whose pin is a DSH prerelease move per matrix version;
  `@deepseek-ai/cordis` (`~4.0.4`) and `@deepseek-ai/schemastery`
  (`~3.18.4`) are versioned independently of DSH and keep their own ranges
  in both `dependencies` and `peerDependencies`.

This was verified against the real install path, not just the solver: with
exact `0.1.7-rc.2` peers, `dsh plugin add` on `0.2.0-rc.1` was *rejected*
unless the user granted an explicit `dsh plugin allow-version` exemption;
with the disjunction, the same packed tarball installs cleanly on both
versions. The tarball ships no `node_modules` (`files` is `lib`,
`vendor/cursor`, `cordis.patch.yml`), so `@deepseek-ai/*` resolves from the
host at runtime — the peer declaration is load-bearing, not advisory.

`dsh-versions.txt` is the single source of truth: the CI matrix reads it,
and the compatibility table in `docs/compatibility.md` mirrors it.

## Alternatives considered

- **Exact pin + per-DSH-line releases (the pre-0.2 status quo).** One plugin
  line per DSH minor, each pinned to its DSH. Correct but doubles release
  work for every DSH minor line and forces users to pick the right plugin
  line for their DSH — a support burden that grows with the window.
  Rejected once the disjunction was verified to install across the window
  from a single artifact.
- **Wide range (`>=0.1.7-rc.2 <0.3.0`).** Rejected on review. A range admits
  future versions the gate has never seen (e.g. a hypothetical `0.2.1-rc.1`)
  and silently extends the promise every time DSH ships — the declaration
  would claim compatibility by default instead of by evidence. A
  disjunction forces a conscious, gated decision per version: detect the new
  RC, propose its disjunct, run the gate, merge, tag.
- **`dsh plugin allow-version` exemption as the strategy.** A user-side
  escape hatch for installing despite a peer mismatch. Useful for
  experimenting with an ungated DSH, but it pushes version judgment onto
  every user instead of answering it once in the release. Not a
  distribution strategy.

## Consequences

One release installs across the whole window, and the plugin version no
longer tracks DSH minor lines. Supporting a new DSH RC is a process —
detect → propose disjunct → gate → merge → tag — never optimism. The cost is
discipline: the disjunction is only as honest as the gate behind it, which
is why the boot smoke installs the packed tarball on every listed version rather than
trusting the package manager's solver. If the window ever needs narrowing
(e.g. a DSH line goes end-of-life), removing a disjunct is the same gated
decision in reverse.
