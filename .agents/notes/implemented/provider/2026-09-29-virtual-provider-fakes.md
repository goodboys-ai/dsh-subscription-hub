# Agent Note: Virtual-provider fakes

Status: implemented

## Problem

Provider adapter logic — OAuth URL construction, PKCE, token storage and
refresh, usage-window classification, model-list filtering, SSE parsing —
needs regression tests that run offline in CI, without touching production
provider servers or using real credentials (the project forbids both, see
the credentials policy in `docs/testing.md`).

## Decision

Each provider route gets a **virtual provider**: a fetch-level router
(`t.mock.method(globalThis, 'fetch', router)`) that simulates the
provider's HTTP surface, driven by the *real* plugin code end to end —
`test/fakes/fake-*.ts` plus `test/*-integration.spec.ts`, one pair per
route (Codex, Claude, Grok, GitHub Copilot, Google Antigravity, Cursor).

The router's contract, per route:

- `GET <authorize-url>` → 302 to the *real* loopback callback server with
  `?code=…&state=…`. No browser; the real `OAuthFlowManager` validates
  state, PKCE, and the callback path against a genuine local server.
- `POST <token-url>` → token JSON with a fake JWT carrying the namespaced
  claims the real session parser reads (e.g. Codex's
  `https://api.openai.com/auth` → `chatgpt_account_id`). The JWTs are
  unsigned (`alg: none`); signatures are never verified, claim paths are.
- Usage / models / completions endpoints → canned payloads exercising the
  real parsing: window classification by duration, catalog sorting and
  visibility filtering, SSE stream translation.

Three load-bearing properties: localhost URLs pass through to the real
`fetch`, so the callback server under test is genuine; **unknown URLs
answer 404**, never a silent pass-through — a request the fake doesn't
recognize fails loudly instead of leaking to production; and the fakes
probe edge behavior, not just the happy path — refresh responses that omit
`refresh_token` (retention from storage), revoked tokens failing loudly,
forged callback state rejected by the real callback server.

Every spec also asserts the *wire details* the fake observed: grant types,
form vs JSON encoding, the PKCE verifier echo, authorization headers,
request bodies. That is what the suite actually pins down — our side of
the contract: request shapes, claim paths, refresh handling, stream
translation.

## Honest boundaries

**Endpoint constants are shared, so URL correctness is not covered.** The
fake routes on the same endpoint constants the production code imports
(e.g. `fake-codex.ts` imports `CODEX_TOKEN_URL` from
`src/providers/codex.js`). An earlier version of this note claimed that
keeps fake and code "in sync" such that renaming an endpoint breaks loudly
— that claim was wrong, and review caught it. The truth is narrower:
sharing the constant means fake and code *agree by construction*. If a
constant's value goes bad, both sides go bad together and the test stays
green. What the shared constants do buy is protection against *renames*
and *signature drift* in the constant set itself; what they cannot buy is
verification that the URL value is the provider's real URL. Catching that
needs literal expected URLs as independent fixtures in the specs — noted,
not yet implemented.

**Cursor model streaming is not covered.** Cursor's generation transport
speaks ConnectRPC over a raw `node:http2` session
(`/agent.v1.AgentService/Run`), which a fetch-level mock cannot intercept;
faking it would mean reimplementing the framing protocol instead of
testing our code. What *is* covered is Cursor's fetch-level contract:
browser-login polling (404-tolerant), token refresh, dashboard usage, and
model discovery through the real vendored protobuf decoder (the spec
augments the transport's type declarations to reach the runtime
`fetchUsableModels`, not a reimplementation). This is a material gap given
Cursor's history of model-surface errors, and it stays open: the
`createAgentRun` injection seam exists in the adapter, but exercising the
real stream behavior without the real HTTP/2 transport is unresolved.

**Grok's OIDC discovery is module-cached** with no reset hook, so only the
first test in the file observes the discovery fetch; the spec asserts it
there rather than in a standalone order-dependent test.

And the standing caveat, repeated because it is the whole point of the
layering: the suite proves *our* side of the contract against a faithful
fake. It cannot prove the provider still honors the contract — a fake can
only replay what was recorded. Provider-side drift is the manual canary's
provider's job (see `docs/testing.md`).

## Alternatives considered

- **Record/replay against production.** Touches production in CI, needs
  real credentials in automation (forbidden), and cassettes rot silently —
  a stale cassette is a fake with extra steps and none of the edge-case
  probing. Rejected.
- **Hand-written mocks per adapter.** Mocks the adapter's dependencies
  rather than the provider's HTTP surface, so the test asserts the mock,
  not the flow. The fetch-level router keeps the assertion at the wire,
  where the provider contract actually lives. Rejected.
- **Real-API tests in CI.** Rejected: six third-party
  consumer OAuth flows, no credentials in automation, production untouched
  by principle.

## Consequences

The suite is a regression net for our flow logic — broken form encoding,
claim-path drift in our parsers, mishandled refresh grants, SSE
translation bugs — fully offline and repeatable. To add a provider, copy
`test/fakes/fake-codex.ts` (router keyed on endpoint constants + helpers
minting whatever credentials its session parser requires) and follow the
spec structure: login → refresh → usage → models → stream. When writing the
spec, remember the shared-constants boundary above: assert the wire
*shapes* against the fake's observations, and treat the URL values
themselves as untested until literal fixtures exist.
