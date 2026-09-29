# DSH Subscription Hub

A single DeepSeek Harness plugin for subscription-backed models and usage queries.

## Features

- **Subscription models:** Use ChatGPT/Codex, Claude, Grok, GitHub Copilot, Google Antigravity, and Cursor in DSH's model picker after connecting an account.
- **Account and model controls:** Sign in, manage accounts, refresh model catalogs, and choose model visibility in **Settings → Subscriptions**. Multi-account providers also support default-account and pool settings.
- **Quota in Settings and sessions:** View available usage windows, progress bars, and reset times on provider cards or in the optional session-footer quota pill. Copilot has no usage endpoint.
- **OpenCode Go and Kimi Code usage:** Read quota for these built-in DSH providers through the API keys already configured in **Settings → Models**; the plugin does not replace their model routes.
- **Provider tools:** Add Codex web search, Grok X search, image generation and editing through ChatGPT or Grok, and Grok video generation when the matching provider is enabled.
- **DSH network settings:** Use the host's network configuration without a separate plugin proxy.

## Install from GitHub

The tested DSH versions are `0.1.7-rc.2` and `0.2.0-rc.1` (peer range
`>=0.1.7-rc.2 <0.3.0`). See [docs/compatibility.md](docs/compatibility.md)
for the support window and [docs/testing.md](docs/testing.md) for the test
layers. With `dsh` available, install the plugin into the web profile:

```sh
dsh plugin --profile web add github:goodboys-ai/dsh-subscription-hub
```

Git installs run this package's `prepare` script to build the host and browser bundles. If pnpm asks for build-script approval, add this package to the web profile's `pnpm-workspace.yaml` and repeat the command:

```yaml
allowBuilds:
  dsh-subscription-hub: true
```

Restart `dsh web` after installation. Open **Settings → Subscriptions** to connect the OAuth providers or Cursor, manage their accounts and model lists, and inspect their quota. OpenCode Go and Kimi Code use API keys configured in **Settings → Models**; their cards show usage when those keys are present. The session footer quota pill can be shown or hidden from **Settings → Subscriptions**.

To update a GitHub installation, run the same `dsh plugin --profile web add github:goodboys-ai/dsh-subscription-hub` command again and restart `dsh web`.

## Migration status

The existing Codex, Claude, Grok, Copilot, and Antigravity providers have been ported to DSH `0.1.7-rc.2`. This includes upstream fixes for first-class `role: "tool"` messages and renamed client icons ([compatibility issue #117](https://github.com/V1ki/dsh-plugin-subscriptions/issues/117)). The source build and test suite pass. An isolated DSH `0.1.7-rc.2` web profile boots with the plugin, serves the client bundle, and responds to its auth and usage-status RPCs. Live provider sign-in and model requests have not yet been exercised.

The Settings page now includes usage-only cards for OpenCode Go and Kimi Code. They resolve `OPENCODE_GO_API_KEY` and `KIMI_CODING_API_KEY` through DSH's credential service on each request. The keys remain on the host; the browser receives only configured status and normalized quota windows. The readers are covered by mocked HTTP tests and an isolated DSH web-profile RPC check. Live account usage responses have been verified for both sources.

Cursor is available as the `cursor-subscription` model route and as a sign-in/usage card on the same Settings page. Its transport is copied from [orrinzeng/dsh-cursor-subscription](https://github.com/orrinzeng/dsh-cursor-subscription) under the MIT license; see [the source note](docs/cursor-origin.md). The DSH `0.1.7-rc.2` boundary projects first-class tool messages into the transport's expected request shape. Its individual-account usage reader calls Cursor dashboard endpoints with a session cookie derived from a Cursor OAuth token. Cursor's documented Admin API is for team usage.

The Cursor card uses browser sign-in and stores the resulting credential through DSH. Its Manage dialog uses the same account and model editor as the other subscription cards: you can refresh the live Cursor catalog and choose which models appear in the picker. The selection persists under the DSH home directory; automatic mode includes newly discovered models. There is no built-in fallback model list. The plugin does not read the local `cursor-agent` credential cache; that file's format and token rotation are outside this plugin's control.

The session footer quota pill now reads Cursor, OpenCode Go, and Kimi Code usage in addition to the OAuth providers. It shows the current model provider when that provider reports quota windows; opening the pill shows all available usage sources. Settings → Subscriptions controls whether the pill is visible in this browser.

The Cursor transport passes 75 selected upstream offline tests plus this project's mocked DSH `0.1.7-rc.2` adapter, auth, usage, and RPC tests. An isolated DSH web profile boots with the provider registered. A live Cursor login and dynamic model discovery have been verified in the isolated DSH profile. A successful live model request remains to be verified.

The plugin uses DSH network settings. Its former proxy card, config file, and RPC endpoints are retired; an old proxy config file is ignored.

## Development

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the PR workflow, test boundaries,
and isolated DSH checks.

Test layers (unit, host-export contract, boot smoke, virtual-provider
integration) are documented in [docs/testing.md](docs/testing.md); the DSH
support window and release process in
[docs/compatibility.md](docs/compatibility.md).

The package is private to prevent npm publication; GitHub source installation is supported. The `cordis.patch.yml` bundle entry and browser module ID use this project's package name, `dsh-subscription-hub`.

## Origins

This project started from [V1ki/dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions) at `090d964` under its MIT license and now includes upstream `0.9.5` (`75a8346`). The upstream English and Chinese READMEs are kept in [`docs/upstream-README.md`](docs/upstream-README.md) and [`docs/upstream-README.zh.md`](docs/upstream-README.zh.md).
