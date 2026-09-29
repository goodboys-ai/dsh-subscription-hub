# Agent Note: Single-tarball CI

Status: implemented

## Problem

Users install one release across the whole DSH support window, so CI must
verify the artifact users actually install — on every DSH version. Testing
a different artifact per version proves nothing about the release.

## Decision

CI packs **exactly one tarball**, from the repository's pinned dependencies
(the window floor), in the `pack` job. The `boot-smoke` matrix downloads
that same tarball artifact and boots it on every DSH version in
`dsh-versions.txt`. Per-version `build-and-test` jobs only swap
`devDependencies` to run build, tests, and L1 against each DSH line — they
never pack. There is deliberately no per-version artifact.

## Alternatives considered

- **Per-version pack (the original flow).** Each matrix job rewrote
  dependencies for its DSH version and packed its own tarball. That tested
  N different artifacts, none of which was the release users install — the
  matrix was green while the shipped tarball was unverified on all but one
  version. Rejected on review.
- **Boot the raw checkout instead of the tarball.** Faster iteration and
  fine for local development, but a checkout install carries `node_modules`
  and never exercises the packed layout: peer resolution from the host,
  the `files` allowlist, the cordis patch applying to a clean tree. The
  release-faithful result requires the tarball.

## Consequences

What CI boots is byte-identical to what users install, on every supported
DSH version. The peer disjunction is exercised against the real install
path per version, not just asserted by the package manager's solver. Cost:
the pack job is a serialization point — boot-smoke waits for it — and a
packaging mistake (a missing file, a broken patch) fails every version at
once instead of one.
