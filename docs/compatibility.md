# Compatibility policy

How this plugin tracks DeepSeek Harness (DSH) releases: which versions are
supported, what "supported" means, how the plugin itself is versioned, and the
release process when a new DSH version lands.

## Support window

DSH is a fast-moving developer preview: every release so far has been a
prerelease (`-alpha`, `-rc`) and breaking changes are routine. This plugin
supports a **sliding window of the latest DSH releases**, defined as the
newest RC of each of the latest three minor lines. Only two minor lines
exist so far (`0.1.x`, `0.2.x`), so the window currently holds two versions.
`dsh-versions.txt` at the repo root is the single source of truth for the
window; the CI matrix and the table below derive from it.

How one release covers the whole window: the `@deepseek-ai/*`
`peerDependencies` are **an exact-version disjunction**, not a range
(currently `0.1.7-rc.2 || 0.2.0-rc.1`) — a deliberate choice: a range like
`>=0.1.7-rc.2 <0.3.0` would also admit future versions such as `0.2.1-rc.1`
that the gate has never seen, promising more than we have verified. A new
disjunct is appended only after the full gate goes green on that DSH
version, so the disjunction always lists exactly the gated versions. DSH's
plugin manager enforces peer versions at install time, but it accepts
disjunctions — verified: with exact `0.1.7-rc.2` peers, installing on
`0.2.0-rc.1` is *rejected* (unless the user grants an explicit
`dsh plugin allow-version` exemption); with the disjunction, the same plugin
installs cleanly on both `0.1.7-rc.2` and `0.2.0-rc.1`, and the packed
tarball (which ships no `node_modules` — `files` is
`lib`, `vendor/cursor`, `cordis.patch.yml`) resolves `@deepseek-ai/*` from
the host at runtime. The `devDependencies` stay pinned exact at the window
floor, so the build never uses APIs newer than the oldest supported DSH.
CI packs exactly one tarball from those pinned dependencies and boots that
same tarball on every DSH version in the window — there is no per-version
artifact. When the window gains a version, the disjunction gains a disjunct;
when it drops one, the disjunct is removed — that, not a per-version release
line, is the maintenance event.

## What "supported" means

A DSH version is **supported** when the CI matrix ran all of these against it
and everything was green:

- `pnpm build` (TypeScript compiles against that version's `@deepseek-ai/*` APIs)
- `pnpm test` (the full unit + integration suite, including the virtual-provider
  end-to-end tests in `docs/testing.md`)
- `scripts/boot-smoke.sh` (an isolated web profile boots with the plugin, the
  cordis patch applies without skips, the client bundle serves)

Status legend:

- ✅ **tested** — the full gate (build + full test suite + L1 contract + L2 boot
  smoke) was green on this combination.
- ⚠️ **untested** — inside the window but the gate hasn't run it yet
  (typically a brand-new RC, less than a few days old).
- ❌ **known-broken** — the gate is red or a specific incompatibility is
  documented; see the notes column.

Anything outside the window is unsupported: it may work, but CI doesn't check
it and issues against it are closed as "upgrade or pin".

## Compatibility table

Plugin `0.1.0`, peers `0.1.7-rc.2 || 0.2.0-rc.1`. Gate results below are from
local runs on 2026-09-29; the CI matrix runs the identical gates on every
push. A cell becomes ✅ only from a green gate run, never from "it should
work".

| DSH | build | tests | L1 contract | L2 boot smoke | Notes |
|-----|-------|-------------|-------------|---------------|-------|
| `0.1.7-rc.2` | ✅ | ✅ | ✅ | ✅ | window floor; devDeps pin here |
| `0.2.0-rc.1` | ✅ | ✅ | ✅ | ✅ | packed-tarball install verified |

"✅ tested" = build + full suite + L1 + L2 green. L2 installed the packed
tarball (the release artifact, no `node_modules`) and asserted the served UI
references `subscription-hub/client.js`.

## Plugin versioning

Plain semver for the plugin itself (`0.1.0`, `0.1.1`, …). Because the peers
are a disjunction listing exactly the gated versions, the plugin version
does **not** need to track the DSH minor line — one release installs across
the whole window, and the CI matrix proves it on each version. When the
window slides, the disjunction gains or loses a disjunct (a minor chore, not
a release line).

Every release gets a git tag (`v0.1.0`), and users pin with it:

```sh
dsh plugin --profile web add github:goodboys-ai/dsh-subscription-hub#v0.1.0
```

That tag is the **downgrade path** — DSH itself offers no downgrade tooling,
so keeping old tags installable is part of the support contract.

Branch strategy: `main` always tracks the newest DSH in the window.
Maintenance branches per DSH minor line are cut only when someone actually
needs a fix on an old line that the current range no longer covers; they are
not pre-created.

## Release process for a new DSH version

1. **Detect.** The release-watch job reports a new DSH release (or you notice it).
2. **Window.** Add the new version to `dsh-versions.txt`; drop the oldest if the
   window now holds more than three.
3. **Disjunction check.** If the new version is not already a disjunct in
   the peer disjunction, append it — but only after step 4 is green for it.
   The disjunction is a promise; don't extend a promise you haven't
   verified.
4. **Gate.** CI must be green on every version in the window: per-version
   build + tests + L1 on each, and L2 booting the single packed tarball on
   each. If the newest fails, fix forward (compat shims live in
   `src/compat.ts`); if an old one fails and the fix is disproportionate,
   shrink the window (and the disjunction) and say so in the table notes.
5. **Document.** Update the compatibility table above; a new ✅ needs a green
   run, not optimism.
6. **Tag.** Merge, tag `vX.Y.Z`, push the tag. GitHub installs from the tag are
   immediately usable.

## What this policy deliberately does not promise

- **Provider-side changes.** When ChatGPT, Claude, Grok, Copilot, Antigravity,
  or Cursor change their login or API surface, the plugin can break on *every*
  DSH version at once. That's caught by the manual pre-release canary and the
  virtual-provider tests (see `docs/testing.md`), not by the DSH matrix.
- **Forward compatibility.** A new DSH RC can break the plugin; the policy
  guarantees a *process* (detect → bump → gate → tag), not that `main` works
  on a DSH released yesterday.
