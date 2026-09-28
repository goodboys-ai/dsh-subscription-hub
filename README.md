# DSH Subscription Hub

A single DeepSeek Harness plugin for subscription-backed models and usage queries.

This project starts from [V1ki/dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions) at `090d964` under its MIT license. The original English and Chinese READMEs are kept in [`docs/upstream-README.md`](docs/upstream-README.md) and [`docs/upstream-README.zh.md`](docs/upstream-README.zh.md).

## Migration status

The existing Codex, Claude, Grok, Copilot, and Antigravity providers have been ported to DSH `0.1.7-rc.2`. The source build and all 506 tests pass. An isolated DSH `0.1.7-rc.2` web profile boots with the plugin, serves the client bundle, and responds to the subscriptions auth-status RPC. Live provider sign-in and model requests have not yet been exercised.

The Settings page now includes usage-only cards for OpenCode Go and Kimi Code. They resolve `OPENCODE_GO_API_KEY` and `KIMI_CODE_API_KEY` through DSH's credential service on each request. The keys remain on the host; the browser receives only configured status and normalized quota windows. The readers are covered by mocked HTTP tests and an isolated DSH web-profile RPC smoke check. Live account responses have not yet been verified.

Cursor support is next, using [orrinzeng/dsh-cursor-subscription](https://github.com/orrinzeng/dsh-cursor-subscription) as the reference. Its individual-account usage reader calls Cursor dashboard endpoints with a session cookie derived from a Cursor OAuth token; Cursor's documented Admin API is for team usage. Cursor is not yet included in this build.

## Development

```sh
pnpm install
pnpm build
pnpm test
```

The package is marked private while the migration is underway. The `cordis.patch.yml` bundle entry and browser module ID use this project's package name, `dsh-subscription-hub`.
