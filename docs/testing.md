# Testing strategy

Five layers. Each catches a failure class the ones below it cannot. The honest
premise: **mocked unit tests prove our logic; they cannot prove the providers
still behave the way we recorded.** The layers above exist to close that gap
as far as automation can, and to say plainly where it can't.

## L0 — Unit tests (have)

All tests in `test/` (including the virtual-provider integration tests)
cover the providers' adapter logic: OAuth URL construction, PKCE, token
storage and refresh, usage-window classification, model-list filtering
and sorting, SSE parsing, error classification and retries. Fully
offline, fully repeatable. This is the regression net.

Catches: request-body construction, usage-window classification, JWT claim
extraction, tool-call reconciliation, RPC validation, adapter wiring.

Cannot catch: everything below.

## L1 — Host-export contract check (have)

`node scripts/check-host-exports.mjs --dsh <version>` / `--all`

Installs that DSH version's `@deepseek-ai/*` packages into a temp dir — only
packages whose current pin is a DSH prerelease move (cordis and schemastery
are versioned independently of DSH and keep their own versions) — then runs
the repo's own `tsc --noEmit` over `src/` with `@deepseek-ai/*` redirected at
the temp install. It is the real compiler doing the check, so there are no
regex heuristics to go stale: if `src/` compiles, every host export the
plugin references exists in that DSH version. Runs in CI per matrix version;
`--all` covers every version in `dsh-versions.txt` with installs cached per
version.

Catches: the link-time failure class — host renamed/removed an export and the
whole plugin tree would fail to load in the GUI. This is the failure the
TypeScript build catches only for the *pinned* version.

## L2 — Boot smoke test (have, verified on 0.2.0-rc.1)

`DSH_VERSION=<v> bash scripts/boot-smoke.sh`

Creates an isolated `DSH_HOME` (a `mktemp` dir — never touches the user's
real profiles), installs this plugin into the `web` profile with
`dsh plugin add`, boots `dsh web --no-open --port 0`, and asserts:

- the plugin installs — **and this is a real gate**: DSH's plugin manager
  enforces `@deepseek-ai/*` peer versions at install time. With exact
  `0.1.7-rc.2` peers, installing on `0.2.0-rc.1` was *rejected* unless the
  user granted an explicit `dsh plugin allow-version` exemption; with the
  exact-version disjunction peers (`0.1.7-rc.2 || 0.2.0-rc.1`, see
  `docs/compatibility.md`) the same release installs cleanly across the window.
- the web UI completes its trust handshake: the printed `?token=` URL is
  single-use (first GET → 303 + session cookie), then the app page answers
  HTTP 200 with the cookie;
- the served app page references `subscription-hub/client.js`, and a request
  to its versioned URL returns non-empty JavaScript — the client bundle is
  served, not just listed in the page;
- the log contains no cordis patch skips (`name mismatch` style silent skips)
  and no module-load failures.

Install the **packed tarball** (`pnpm pack`, without `node_modules`) rather
than the raw checkout when checking packed layout: `@deepseek-ai/*` must
resolve from the host. CI does this; a raw-directory install is useful for
quick iteration. The README's GitHub install builds through `prepare` on
the user's machine, so CI's tarball smoke does not prove the two installs
produce identical bytes.

Runs in CI per matrix version, always against the **same** packed tarball:
CI's `pack` job builds one tarball from the repo's pinned dependencies and
the `boot-smoke` matrix boots that identical artifact on every DSH version —
there is deliberately no per-version artifact. What it does not assert: RPC
behavior (the `/subscriptions-auth` channel has no stable HTTP form to curl)
and any provider login — that's L3 (virtual) plus the manual pre-release canary.

Catches: mount-time failures — the plugin installs but doesn't load, the
client bundle fails to serve non-empty JavaScript, or the patch that
registers providers is silently skipped.

## L3 — Virtual-provider integration tests (have: all six providers)

`test/fakes/*.ts` + `test/*-integration.spec.ts`. Every provider route has
one: Codex, Claude, Grok, GitHub Copilot, Google Antigravity, Cursor.

A **virtual provider** is a fetch-level router (`t.mock.method(globalThis,
'fetch', router)`) that simulates the provider's HTTP surface:

- `GET <authorize-url>` → 302 redirect to the *real* loopback callback server
  with `?code=…&state=…` (no browser needed; the real `OAuthFlowManager`
  validates state, PKCE, and the callback path),
- `POST <token-url>` → token JSON with a fake JWT carrying the namespaced
  claims the real code reads (`https://api.openai.com/auth.chatgpt_account_id`),
- usage / models / completions endpoints → canned payloads exercising the real
  parsing: window classification by duration, catalog sorting and visibility
  filtering, SSE stream translation.

Each `test/<provider>-integration.spec.ts` drives the real code end to end:
login flow → code exchange → refresh → usage → catalog discovery → (where the
transport allows it) a model run through the real adapter's `stream()`.
Localhost URLs pass through to the real `fetch` so the loopback callback
server under test is genuine. Every spec also asserts the *wire details* the
fake observed: grant types, form vs JSON encoding, PKCE verifier echo,
authorization headers, request bodies.

The fakes deliberately probe edge behavior, not just the happy path: refresh
responses that omit `refresh_token` (retention from storage), unknown
endpoints answering 404 (no silent pass-through to production), revoked
tokens failing loudly, forged callback state rejected by the real callback
server.

Two honest boundaries, documented in the specs and fakes:

- **Cursor model streaming is not covered.** Cursor's generation transport
  speaks ConnectRPC over a raw `node:http2` session
  (`/agent.v1.AgentService/Run`), which a fetch-level mock cannot intercept —
  faking it would mean reimplementing the framing protocol instead of testing
  our code. Cursor's fetch-level contract (browser-login poll, token refresh,
  usage, protobuf model discovery) is fully covered.
- **Grok's OIDC discovery is module-cached** with no reset hook, so only the
  first test in the file observes the discovery fetch; the spec asserts it
  there rather than in a standalone order-dependent test.

To add a virtual provider for a future route, copy the pattern in
`test/fakes/fake-codex.ts`: a router keyed on that provider's endpoint
constants, plus helpers minting whatever credentials its session parser
requires; reuse the real `FlowSpec` for the authorize step; then add
`test/<provider>-integration.spec.ts` following the existing specs'
structure: login → refresh → usage → models → stream.

Catches: regressions in *our* flow logic — broken form encoding, claim-path
drift in our parsers, mishandled refresh grants, SSE translation bugs. It
proves the plugin's side of the contract against a faithful fake. The
strategy, its alternatives, and its honest boundaries are recorded in the
[virtual-provider fakes](../.agents/notes/implemented/testing/2026-09-29-virtual-provider-fakes.md)
agent note.

**It does not prove the provider still honors the contract.** A fake can only
replay what we recorded. When the provider changes their site, these tests
stay green and the plugin breaks in production. That gap is handled by the
manual canary below, not by more fakes.

## Pre-release canary (manual — not a test layer)

Automated tests never touch production provider servers, so provider-side
drift has no automated coverage by design. The backstop is manual: before
tagging a release, log in once per provider in an isolated profile and run
one model request — exactly the "use it to know" step. The README's
migration-status notes record which providers have had a live canary on the
current DSH line. (An automated drift monitor was built and then removed.)

## What "tested" means in the compatibility table

A ✅ in `docs/compatibility.md` means the full gate (L0 + L1 + L2) was green
on that DSH version. L3 runs in the same `pnpm test` invocation, so it's included.
Provider canary status is recorded separately in the README migration notes
per provider.

## Credentials policy for tests

No test — at any layer, in CI or locally — uses real provider credentials
or touches a production provider server. L3 uses fake JWTs and fake tokens
by construction. The manual pre-release canary is the only thing that ever
touches a real account, and it is done by the maintainer, in an isolated
profile. If a test needs a secret, the test is wrong.
