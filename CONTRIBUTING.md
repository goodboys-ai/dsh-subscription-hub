# Contributing to DSH Subscription Hub

Use a topic branch or fork and submit a pull request. Changes to `main` go
through PR review and the CI gate. The [PR template](.github/PULL_REQUEST_TEMPLATE.md)
asks for the problem, a concise thinking path, verification, compatibility
risks, and AI disclosure.

In the thinking path, connect an existing project constraint or failure to
the chosen approach and its meaningful trade-offs. In AI disclosure, name the
tool and share a relevant prompt, conversation link, or summary of the work
delegated to it; use `N/A` when no AI tool was used.

## Set up and check a change

CI uses Node.js 24, and `package.json` pins pnpm 10.33.2. From a checkout:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

The test suite uses fake provider responses and must run without real provider
credentials or calls to production provider servers. `pnpm test` refuses any
connection that leaves loopback and fails the spec that tried, so mock every
provider request a new test makes. If you change an Agent Note, also run
`node scripts/verify-agent-notes.mjs`.

Run checks that cover the change and report the commands and results in the
PR. [testing.md](docs/testing.md) lists what each check covers:

- DSH compatibility or packaging: the host-export and host contract checks
  (`--all`) and the isolated boot smoke.
- Client UI, the usage bar, model registration, or streaming: the host E2E,
  `bash scripts/host-e2e.sh`. It needs Chrome or Chromium (`CHROME_BIN`).
- A client change that reads a new host name (icon, slot, service, DOM
  marker, theme token, host export): add it to
  `src/client/host-contract.ts`; `test/host-contract.spec.ts` fails until you
  do. Name it with a literal, not a computed string, so the scan can see it.
- A plugin change that makes a new provider request in the host E2E path:
  add a fixture or a planned refusal to `scripts/host-e2e-fixture.mjs`; the
  host E2E fails on any request it did not plan.

Every script creates a temporary `DSH_HOME` and does not use an existing DSH
profile. CI builds one tarball and runs it on every version in
`dsh-versions.txt`; see the [compatibility policy](docs/compatibility.md)
before changing that window.

A bug fix comes with a test that fails without the fix. Say in the PR which
test that is, and add a row to the bug replay table in
[testing.md](docs/testing.md#bug-replay) when the bug is user-visible.

## Provider and UI changes

Add or update offline adapter and virtual-provider tests for changed request
or response behavior. These tests check the plugin's side of a recorded
provider contract; they do not prove that a provider still accepts it. The
manual pre-release canary in [testing.md](docs/testing.md) covers live
provider behavior in an isolated profile.

For visible UI changes, include a screenshot or recording and state what was
checked. Update the owning documentation or Agent Note when behavior or a
durable decision changes. Follow the [prose standard](.agents/skills/subscription-hub-prose-standard/SKILL.md)
for comments, docs, and user-visible text.
