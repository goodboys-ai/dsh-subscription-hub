# Compatibility policy

How this plugin tracks DeepSeek Harness (DSH) releases: which versions are
supported, what "supported" means, how the plugin itself is versioned, and
how a plugin release is published.

## Support window

DSH is a fast-moving developer preview: every release so far has been a
prerelease (`-alpha`, `-rc`) and breaking changes are routine. This plugin
supports a **sliding window of the latest DSH releases**, defined as the
newest RC of each of the latest three minor lines. Only two minor lines
exist so far (`0.1.x`, `0.2.x`), so the window currently holds two versions.
`dsh-versions.txt` at the repo root is the single source of truth for the
window; the CI matrix and the table below derive from it.

One release covers the whole window: the `@deepseek-ai/*`
`peerDependencies` are **an exact-version disjunction** listing exactly the
gated versions (currently `0.1.7-rc.2 || 0.2.0-rc.1`). Add a candidate
disjunct and its `dsh-versions.txt` entry in the same PR, then merge only
after the full gate passes on every listed version. Remove a disjunct when
the window drops that version. The `devDependencies` stay pinned exact at
the window floor, so the build never uses APIs newer than the oldest
supported DSH.
CI packs exactly one tarball from those pinned dependencies and boots that
same tarball on every DSH version in the window — there is no per-version
artifact. When the window gains a version, the disjunction gains a disjunct;
when it drops one, the disjunct is removed — that, not a per-version release
line, is the maintenance event.

The rationale lives in agent notes:
[exact-version peer disjunction](../.agents/notes/implemented/process/2026-09-29-exact-peer-disjunction.md)
and [single-tarball CI](../.agents/notes/implemented/testing/2026-09-29-single-tarball-ci.md).

## What "supported" means

A DSH version is **supported** when the CI matrix ran all of these against it
and everything was green:

- `pnpm build` (TypeScript compiles against that version's `@deepseek-ai/*` APIs)
- `pnpm test` (the full unit + integration suite, including the virtual-provider
  end-to-end tests in `docs/testing.md`)
- `scripts/boot-smoke.sh` (an isolated web profile boots with the plugin, the
  cordis patch applies without skips, the client bundle serves as JavaScript,
  the logged-out auth and external-usage RPCs answer, and the usage bar
  renders from the fake profile under `test/fixtures/usage-bar-profile/`)

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

Current source version `0.1.0`, peers `0.1.7-rc.2 || 0.2.0-rc.1`. Gate
results below are from local runs on 2026-09-29; the CI matrix runs the
identical gates on every push. A cell becomes ✅ only from a green gate run,
never from "it should work".

| DSH | build | tests | L1 contract | L2 boot smoke | Notes |
|-----|-------|-------------|-------------|---------------|-------|
| `0.1.7-rc.2` | ✅ | ✅ | ✅ | ✅ | window floor; devDeps pin here |
| `0.2.0-rc.1` | ✅ | ✅ | ✅ | ✅ | packed-tarball install verified |

"✅ tested" = build + full suite + L1 + L2 green. L2 installed the packed
tarball (no `node_modules`) and requested the client bundle as JavaScript.

## Plugin versioning

The plugin uses semver independently of DSH (`0.1.0`, `0.1.1`, …). During the
`0.x` series, use a patch for compatible fixes or DSH support expansion that
keeps the old window, and a minor for a new provider, a breaking setting, or
dropped DSH support. A peer-window change still requires a new plugin
version and tag; it does not create one plugin release line per DSH minor. The
current source version `0.1.0` targets both DSH `0.1.7-rc.2` and
`0.2.0-rc.1`, so its minor version cannot identify one DSH minor. The exact
peers and CI matrix state host compatibility; plugin patches can ship between
DSH releases.

Every release tag matches `package.json` (`v0.1.0` for version `0.1.0`). Once
that tag is published, users can pin with it:

```sh
dsh plugin --profile web add github:goodboys-ai/dsh-subscription-hub#v0.1.0
```

That tag is the **downgrade path** — DSH itself offers no downgrade tooling.
Never move or reuse a release tag. Protect `v*` tags against updates and
deletion with a GitHub [tag ruleset](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)
or [immutable releases](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes)
before the first release.

Branch strategy: `main` always tracks the newest DSH in the window.
Maintenance branches per DSH minor line are cut only when someone actually
needs a fix on an old line that the current range no longer covers; they are
not pre-created.

## Release process

1. **Prepare a PR.** Set the intended plugin version in `package.json` and
   draft release notes. Update the README and compatibility table for changed
   behavior. When adding a DSH RC, update `dsh-versions.txt` and the exact
   peer disjunction together in this PR. Drop the oldest RC if the window
   exceeds three minor lines, and move the pinned dev dependencies and
   lockfile to the new floor when the old floor leaves. There is no
   release-watch job; check DSH releases manually until one is added.
2. **Run the gate.** Require the PR's `CI gate`: per-version build, tests,
   and L1 contract checks, plus L2 boot of one packed tarball on every
   listed DSH version. If a version fails, fix the plugin or narrow the
   window and peers in the PR. Record a new ✅ in the compatibility table
   only after its gate passes.
3. **Check live behavior.** Run the [manual canary](testing.md#pre-release-canary-manual--not-a-test-layer)
   from the PR commit in isolated profiles on each supported DSH version.
   Check provider login, usage, and a model request, plus usage-only sources
   and changed tools. Record the date and each result, including checks not
   run, in the README's [verification section](../README.md#verification-and-limits).
   If live checks remain open, use a plugin prerelease version and state the
   gaps in its GitHub Release.
4. **Check the merge commit.** Merge through a PR and confirm its CI gate.
   CI boots a packed tarball, while a GitHub source install also runs
   `prepare`. On each supported DSH version, install
   `github:goodboys-ai/dsh-subscription-hub#<merge-sha>` in an isolated
   profile and confirm the plugin loads after restart. `scripts/boot-smoke.sh`
   with `PLUGIN_SOURCE` set to that spec does this unless the DSH version
   blocks `prepare` (`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`, currently
   `0.1.7-rc.2`); there, add the README's `allowBuilds` entry to the profile
   before installing. If this fails, fix it through another PR before
   tagging.
5. **Publish from `main`.** Create `vX.Y.Z` at the checked merge commit and
   publish a GitHub Release with the supported DSH versions, completed live
   checks, known limits, and pinned install command. Mark prerelease versions
   as GitHub prereleases. Keep `private: true` in `package.json`; users
   install from GitHub source, not npm. This process is manual today; no
   release workflow publishes tags or assets.

## What this policy deliberately does not promise

- **Provider-side changes.** When ChatGPT, Claude, Grok, Copilot, Antigravity,
  or Cursor change their login or API surface, the plugin can break on *every*
  DSH version at once. Neither the DSH matrix nor offline virtual-provider
  tests detect provider-side drift. The manual canary in
  [testing.md](testing.md) checks live behavior before a release.
- **Forward compatibility.** A new DSH RC can break the plugin; the policy
  guarantees a *process* (detect → gate → canary → tag), not that `main` works
  on a DSH released yesterday.
