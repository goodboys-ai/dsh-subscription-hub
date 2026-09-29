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
credentials or calls to production provider servers. If you change an Agent
Note, also run `node scripts/verify-agent-notes.mjs`.

Run checks that cover the change and report the commands and results in the
PR. For DSH compatibility or packaging changes, use the isolated boot smoke
described in [testing.md](docs/testing.md). It creates a temporary `DSH_HOME`
and does not use an existing DSH profile. CI builds one tarball and boots it
on every version in `dsh-versions.txt`; see the
[compatibility policy](docs/compatibility.md) before changing that window.

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
