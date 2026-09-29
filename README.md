# DSH Subscription Hub

Bring your AI subscriptions into
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). One
plugin adds their models to the native picker and puts account controls and
reported quota in **Settings → Subscriptions**.

## What it adds

- **Six subscription model sources:** Connect ChatGPT/Codex, Claude, Grok,
  GitHub Copilot, Google Antigravity, or Cursor and choose their models in
  DSH's picker. These routes use account sign-in, without provider API keys.
- **Account and model control:** Refresh catalogs and choose visible models.
  For Codex, Claude, Grok, Copilot, and Antigravity, manage multiple accounts
  and same-provider pools. Pools can use available quota to select an account
  and fail over before a reply starts. See [account management](docs/account-management.md).
- **Quota while you work:** See reported usage windows and reset times on
  provider cards and in an optional session-footer pill. The same view reads
  OpenCode Go and Kimi Code usage through keys already configured in
  **Settings → Models**. Their model routes remain built into DSH. GitHub
  Copilot has no usage endpoint.
- **Provider tools:** Use Codex web search, Grok X search, ChatGPT or Grok
  image generation and editing, and Grok video generation when the matching
  provider is enabled.

## Install from GitHub

Current source is tested with DSH `0.1.7-rc.2` and `0.2.0-rc.1`; the package
accepts exactly those two versions as peers. See
[docs/compatibility.md](docs/compatibility.md)
for the support window and [docs/testing.md](docs/testing.md) for the test
layers. With `dsh` available, install the plugin into the web profile:

```sh
dsh plugin --profile web add github:goodboys-ai/dsh-subscription-hub
```

Git installs run this package's `prepare` script to build the host and browser
bundles. If the install stops with `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`
(DSH `0.1.7-rc.2` does this by default), add this package to the web
profile's `pnpm-workspace.yaml` (`~/.dsh/profiles/web/` unless `DSH_HOME` is
set) and repeat the command:

```yaml
allowBuilds:
  dsh-subscription-hub: true
```

Restart `dsh web` after installation. Open **Settings → Subscriptions** to
connect providers, manage accounts and model lists, and inspect available
quota. The session footer quota pill can be shown or hidden there for the
current browser. OpenCode Go and Kimi Code cards show usage when their API
keys are configured in **Settings → Models**.

To update a GitHub installation, run the same `dsh plugin --profile web add github:goodboys-ai/dsh-subscription-hub` command again and restart `dsh web`.

Without a `#vX.Y.Z` suffix, the command installs the current default branch
at install time. Once a versioned tag is published, append its tag to the
GitHub spec to pin an installation; see the
[release policy](docs/compatibility.md#plugin-versioning).

## Verification and limits

CI builds, tests, and boots a packed tarball on both supported DSH versions;
it does not run the GitHub source install's `prepare` step. Offline
provider tests check recorded API responses, so a passing CI run cannot prove
that a provider still accepts live sign-in or model requests. See
[testing](docs/testing.md) for the checks and their limits.

- **ChatGPT/Codex, Claude, Grok, GitHub Copilot, and Google Antigravity:**
  The port includes the tool-message and icon fixes tracked in
  [upstream issue #117](https://github.com/V1ki/dsh-plugin-subscriptions/issues/117).
  A manual check in an isolated `0.1.7-rc.2` web profile found the client
  bundle served and the auth and usage-status RPCs answering. Live sign-in
  and model requests on the supported DSH lines remain to be checked.
- **Cursor:** Browser sign-in and live model discovery were verified in an
  isolated `0.1.7-rc.2` profile. A successful live model request remains to be
  verified. Its transport comes from
  [orrinzeng/dsh-cursor-subscription](https://github.com/orrinzeng/dsh-cursor-subscription)
  and uses an undocumented Cursor protocol; see the
  [source note](docs/cursor-origin.md).
- **OpenCode Go and Kimi Code:** Live usage responses were verified. Their API
  keys stay on the DSH host; the browser receives configured status and quota
  windows, not the keys.

Cursor uses one connected account and a live model catalog. Its model
visibility selection persists under the DSH home directory, and automatic
display follows newly discovered models. It ships no fallback model list and
does not import the local `cursor-agent` credential cache. Individual usage
comes from Cursor dashboard endpoints; the documented Admin API covers team
usage.

The plugin follows DSH network settings. Its former proxy configuration and
UI have been retired; an old plugin proxy config file is ignored.

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
