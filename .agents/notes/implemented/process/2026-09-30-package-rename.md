# Agent Note: Package rename to dsh-subscriptions

Status: implemented

## Problem

The published package name `@goodboys-ai/dsh-subscription-hub` is awkward
everywhere a user types or reads it: the install command, the plugin
identity in logs and diagnostics, and UI copy. The obvious unscoped name
`dsh-subscription-hub` was squatted on npm by an unknown third party at
publication time and later unpublished — but npm permanently reserves
unpublished names, so it is unrecoverable (verified unavailable). Staying
on the scoped name is safe; it is also permanently clunky, and the
install-command friction compounds with every user.

## Decision

The npm package and the plugin identity are renamed to `dsh-subscriptions`:
`package.json` `name`, the Cordis `export const name`, the browser bundle
module ID, the `cordis.patch.yml` insert entry, log prefixes, and the
canonical install command (`dsh plugin --profile web add dsh-subscriptions`).
The GitHub repository slug `goodboys-ai/dsh-subscription-hub` is unchanged —
GitHub installs, the trusted-publisher repo binding, and all repo URLs keep
working. The `v0.1.0` release stays published under the scoped name as
history; the rename repeats the npm bootstrap for the new name (one manual
publish, then trusted-publisher re-registration, per
[2026-09-30-npm-trusted-publishing.md](2026-09-30-npm-trusted-publishing.md)),
and the scoped package is deprecated with a pointer once the new name's
first publish succeeds. Installing both packages side by side registers the
same adapters twice and breaks plugin load, so the docs tell users to
remove the old package first.

## Alternatives considered

- **Keep the scoped name.** Zero migration risk, but the install and
  diagnostic friction is permanent, and every release cements the awkward
  name further. The rename cost is one bootstrap plus one deprecation —
  small while the package has ~zero users.
- **Attempt to recover the unscoped `dsh-subscription-hub`.** Permanently
  reserved under npm's unpublished-name policy; verified unavailable. Not
  an option, recorded so nobody re-investigates.
- **Rename the GitHub repo to match.** Breaks every existing clone, the
  trusted-publisher binding, and the `github:` install refs for no user
  benefit; the repo slug is not user-typed the way the package name is.

## Consequences

The maintainer owes a second manual bootstrap (first publish + trusted
publisher registration) for `dsh-subscriptions`, and the scoped package
must be deprecated after the new name's first publish. `v0.1.0` is orphaned
under the old name — acceptable with ~zero users, and the GitHub source
install path covers anyone who pinned it. The rename sweeps every identity
surface at once (the #19 F1 lesson: a partial rename that leaves
`cordis.patch.yml` `insert.name`, the bundle ID, or the boot-smoke grep
patterns pointing at the old name breaks plugin load in ways CI catches
only when the sweep is complete); `test/package-identity.spec.ts` pins the
chain so a future partial rename fails the gate.
