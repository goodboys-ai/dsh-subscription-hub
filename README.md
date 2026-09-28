# DSH Subscription Hub

A single DeepSeek Harness plugin for subscription-backed models and usage queries.

This project started from [V1ki/dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions) at `090d964` under its MIT license and now includes upstream `0.9.5` (`75a8346`). The upstream English and Chinese READMEs are kept in [`docs/upstream-README.md`](docs/upstream-README.md) and [`docs/upstream-README.zh.md`](docs/upstream-README.zh.md).

## Migration status

The existing Codex, Claude, Grok, Copilot, and Antigravity providers have been ported to DSH `0.1.7-rc.2`. This includes upstream fixes for first-class `role: "tool"` messages and renamed client icons ([compatibility issue #117](https://github.com/V1ki/dsh-plugin-subscriptions/issues/117)). The source build and test suite pass. An isolated DSH `0.1.7-rc.2` web profile boots with the plugin, serves the client bundle, and responds to its auth and usage-status RPCs. Live provider sign-in and model requests have not yet been exercised.

The Settings page now includes usage-only cards for OpenCode Go and Kimi Code. They resolve `OPENCODE_GO_API_KEY` and `KIMI_CODING_API_KEY` through DSH's credential service on each request. The keys remain on the host; the browser receives only configured status and normalized quota windows. The readers are covered by mocked HTTP tests and an isolated DSH web-profile RPC check. Live account usage responses have been verified for both sources.

Cursor is available as the `cursor-subscription` model route and as a sign-in/usage card on the same Settings page. Its transport is copied from [orrinzeng/dsh-cursor-subscription](https://github.com/orrinzeng/dsh-cursor-subscription) under the MIT license; see [the source note](docs/cursor-origin.md). The DSH `0.1.7-rc.2` boundary projects first-class tool messages into the transport's expected request shape. Its individual-account usage reader calls Cursor dashboard endpoints with a session cookie derived from a Cursor OAuth token. Cursor's documented Admin API is for team usage.

The Cursor card uses its own browser sign-in and stores the resulting credential through DSH. Its Manage dialog shows the live account model catalog and can refresh the model picker. There is no built-in fallback model list. It does not read the local `cursor-agent` credential cache; that file's format and token rotation are outside this plugin's control.

The Cursor transport passes 75 selected upstream offline tests plus this project's mocked DSH `0.1.7-rc.2` adapter, auth, usage, and RPC tests. An isolated DSH web profile boots with the provider registered. A live Cursor login and dynamic model discovery have been verified in the isolated DSH profile. A successful live model request remains to be verified.

The plugin uses DSH network settings. Its former proxy card, config file, and RPC endpoints are retired; an old proxy config file is ignored.

## Development

```sh
pnpm install
pnpm build
pnpm test
```

The package is marked private while the migration is underway. The `cordis.patch.yml` bundle entry and browser module ID use this project's package name, `dsh-subscription-hub`.
