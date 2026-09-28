# DSH Subscription Hub

A single DeepSeek Harness plugin for subscription-backed models and usage queries.

This project starts from [V1ki/dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions) at `090d964` under its MIT license. The original English and Chinese READMEs are kept in [`docs/upstream-README.md`](docs/upstream-README.md) and [`docs/upstream-README.zh.md`](docs/upstream-README.zh.md).

## Migration status

The existing Codex, Claude, Grok, Copilot, and Antigravity providers have been ported to DSH `0.1.7-rc.2`. The source build and test suite pass. An isolated DSH `0.1.7-rc.2` web profile boots with the plugin, serves the client bundle, and responds to its auth and usage-status RPCs. Live provider sign-in and model requests have not yet been exercised.

The Settings page now includes usage-only cards for OpenCode Go and Kimi Code. They resolve `OPENCODE_GO_API_KEY` and `KIMI_CODE_API_KEY` through DSH's credential service on each request. The keys remain on the host; the browser receives only configured status and normalized quota windows. The readers are covered by mocked HTTP tests and an isolated DSH web-profile RPC smoke check. Live account responses have not yet been verified.

Cursor is available as the `cursor-subscription` model route and as a sign-in/usage card on the same Settings page. Its transport is copied from [orrinzeng/dsh-cursor-subscription](https://github.com/orrinzeng/dsh-cursor-subscription) under the MIT license; see [the source note](docs/cursor-origin.md). The DSH `0.1.7-rc.2` boundary projects first-class tool messages into the transport's expected request shape. Its individual-account usage reader calls Cursor dashboard endpoints with a session cookie derived from a Cursor OAuth token. Cursor's documented Admin API is for team usage.

The Cursor card uses its own browser sign-in and stores the resulting credential through DSH. It does not read the local `cursor-agent` credential cache; that file's format and token rotation are outside this plugin's control.

The Cursor transport passes 75 selected upstream offline tests plus this project's mocked DSH `0.1.7-rc.2` adapter, auth, usage, and RPC tests. An isolated DSH web profile boots with the provider registered. A live Cursor login and model request have not yet been verified.

## Development

```sh
pnpm install
pnpm build
pnpm test
```

The package is marked private while the migration is underway. The `cordis.patch.yml` bundle entry and browser module ID use this project's package name, `dsh-subscription-hub`.
