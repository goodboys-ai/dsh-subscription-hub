# Agent Note: Virtual-provider fakes

Status: implemented

## Problem

Provider adapter logic — OAuth URL construction, PKCE, token storage and
refresh, usage-window classification, model-list filtering, SSE parsing —
needs regression tests that run offline in CI, without touching production
provider servers or using real credentials.

## Decision

Each provider route gets a **virtual provider**: a fetch-level router
(`t.mock.method(globalThis, 'fetch', router)`) that simulates the
provider's HTTP surface, driven by the real plugin code end to end:

- `GET <authorize-url>` → 302 to the *real* loopback callback server with
  `?code=…&state=…` (no browser; the real `OAuthFlowManager` validates
  state, PKCE, and the callback path);
- `POST <token-url>` → token JSON with a fake JWT carrying the namespaced
  claims the real session parser reads;
- usage / models / completions endpoints → canned payloads exercising the
  real parsing: window classification, catalog sorting and visibility
  filtering, SSE stream translation.

Localhost URLs pass through to the real `fetch`, so the callback server
under test is genuine. Unknown endpoints answer 404 — never a silent
pass-through to production. The fakes probe edge behavior, not just the
happy path: refresh responses that omit `refresh_token` (retention from
storage), revoked tokens failing loudly, forged callback state rejected by
the real callback server. Every spec also asserts the wire details the fake
observed: grant types, form vs JSON encoding, PKCE verifier echo,
authorization headers, request bodies.

Two honest boundaries: **Cursor model streaming is not covered** — its
generation transport speaks ConnectRPC over a raw `node:http2` session
(`/agent.v1.AgentService/Run`), which a fetch-level mock cannot intercept;
faking it would mean reimplementing the framing protocol instead of testing
our code. Cursor's fetch-level contract (browser-login poll, token refresh,
usage, protobuf model discovery) is fully covered. And **Grok's OIDC
discovery is module-cached** with no reset hook, so only the first test in
the file observes the discovery fetch; the spec asserts it there.

## Alternatives considered

- **Record/replay against production.** Touches production in CI, needs
  real credentials in automation, and cassettes rot silently — a stale
  cassette is a fake with extra steps and none of the edge-case probing.
- **Hand-written mocks per adapter.** Mocks the adapter's dependencies
  rather than the provider's HTTP surface, so the test asserts the mock,
  not the flow. The router keyed on the provider's endpoint constants keeps
  fake and code in sync: rename an endpoint and the fake breaks loudly.

## Consequences

The suite proves *our* side of the contract — request shapes, claim paths,
refresh handling, stream translation — against a faithful fake, fully
offline and repeatable. It cannot prove the provider still honors the
contract; that is the manual canary's job
([drop-l4 note](../testing/2026-09-29-drop-l4.md)). To add a provider, copy
`test/fakes/fake-codex.ts` (router keyed on endpoint constants + credential
helpers) and follow the spec structure: login → refresh → usage → models →
stream.
