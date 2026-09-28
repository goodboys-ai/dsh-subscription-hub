# DSH Subscription Hub

A single DeepSeek Harness plugin for subscription-backed models and usage queries.

This project starts from [V1ki/dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions) at `090d964` under its MIT license. The original English and Chinese READMEs are kept in [`docs/upstream-README.md`](docs/upstream-README.md) and [`docs/upstream-README.zh.md`](docs/upstream-README.zh.md).

## Migration status

The existing Codex, Claude, Grok, Copilot, and Antigravity providers have been ported to DSH `0.1.7-rc.2`. The source build and all 506 tests pass. An isolated DSH `0.1.7-rc.2` web profile boots with the plugin, serves the client bundle, and responds to the subscriptions auth-status RPC. Live provider sign-in and model requests have not yet been exercised.

Later milestones will add Cursor using [orrinzeng/dsh-cursor-subscription](https://github.com/orrinzeng/dsh-cursor-subscription), followed by usage-only readers for OpenCode Go and Kimi Code. Those additions are not part of the current build.

## Development

```sh
pnpm install
pnpm build
pnpm test
```

The package is marked private while the migration is underway. The `cordis.patch.yml` bundle entry and browser module ID use this project's package name, `dsh-subscription-hub`.
