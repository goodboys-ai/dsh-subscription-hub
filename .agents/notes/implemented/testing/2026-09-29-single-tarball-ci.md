# Agent Note: Single-tarball CI

Status: implemented

## Problem

Users install one release across the whole DSH support window, so CI must
verify the artifact users actually install — on every DSH version. The
original flow did the opposite: each matrix job rewrote dependencies for
its DSH version and packed its own tarball. That tested N different
artifacts, none of which was the release. The matrix could go green while
the shipped tarball was unverified on all but one version — and packaging
mistakes (a missing file, a `files`-allowlist slip, the cordis patch
failing on a clean tree) are exactly the class of bug a per-version pack
cannot see, because every job packed from its own mutated checkout.

## Decision

CI packs **exactly one tarball**, from the repository's pinned dependencies
(the window floor), in the `pack` job. The `boot-smoke` matrix downloads
that same tarball artifact and boots it on every DSH version in
`dsh-versions.txt`. The per-version `build-and-test` jobs only swap
`devDependencies` to run the build, the test suite, and the L1 host-export
check against each DSH line — they never pack. There is deliberately no
per-version artifact.

Why the tarball and not the checkout: a raw-directory install carries
`node_modules` and never exercises the packed layout. Only the tarball
tests the production conditions — `@deepseek-ai/*` resolving from the host
(no `node_modules` shipped), the `files` allowlist (`lib`,
`vendor/cursor`, `cordis.patch.yml`), and the cordis patch applying to a
clean tree. `boot-smoke.sh` builds an isolated `DSH_HOME` (a `mktemp` dir,
never the user's real profiles), installs with `dsh plugin add`, boots
`dsh web --no-open --port 0`, and asserts the trust handshake (single-use
`?token=` URL → 303 + session cookie → app page 200), that the served HTML
references `subscription-hub/client.js`, and that the log shows no cordis
patch skips or module-load failures.

The value of testing the real install path was demonstrated, not assumed:
`boot-smoke` failed in CI while passing locally because the job had no
pnpm installed and `dsh plugin add` shells out to pnpm. The fix (commit
`47e05213`) added `pnpm/action-setup` to the job — a reminder that the
smoke test covers the install's tool dependencies too, which only matters
because the job performs a genuine install.

## Alternatives considered

- **Per-version pack (the original flow).** Described above. Rejected on
  review: it verified N artifacts and shipped an (N+1)th.
- **Boot the raw checkout instead of the tarball.** Faster iteration, and
  fine for local development (`boot-smoke.sh` supports it), but it skips
  every packed-layout check that distinguishes a release from a checkout.
  The release-faithful result requires the tarball.
- **Smoke-test a single DSH version.** Cheaper, but the peer disjunction
  exists to span the window — installing on one version would leave the
  cross-version install claim (the whole point of the disjunction) to the
  solver's word. The matrix boots the identical bytes everywhere.

## Consequences

What CI boots is byte-identical to what users install, on every supported
DSH version, and the peer disjunction is exercised against the real install
path per version. The costs are structural: the `pack` job is a
serialization point (boot-smoke waits for it), and a packaging mistake now
fails every version at once instead of one — which is the desired
loudness for a defect in the single thing being shipped.

One known limitation, recorded honestly: the smoke test asserts the served
HTML *references* `subscription-hub/client.js` but never requests the
bundle file itself, so a bundle that 404s would still pass (flagged in
review; not yet fixed). The docs' L2 "Catches" list overclaims here —
"the client bundle 404s" is not currently caught.
