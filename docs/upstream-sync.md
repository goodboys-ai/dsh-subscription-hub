# Upstream sync

This plugin derives from [V1ki/dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions)
(npm `dsh-plugin-subscriptions`). The fork rewrote the settings UI, retired
the plugin-level proxy in favor of host-managed network routing, added the
Cursor/OpenCode Go/Kimi Code integrations, and widened the DSH compatibility
window — areas where a wholesale merge can never apply. Provider protocol
fixes, auth-store robustness, and usage accounting still land upstream,
though, and this repo tracks them selectively.

## Sync point

- **Baseline:** upstream `v0.9.5` — commit `75a83460b27f869d6972c6d0a2b39d76ca49eabb` (2026-09-28).
- **Ported on top:** `f6e1b3f177bd6c9dcb09bbbe7649dbbb0d6b92ab` — the
  Settings card shows the CLI version Codex and Claude present, with its
  source (npm latest / local CLI / built-in fallback / configured), so a
  failed npm lookup no longer masquerades as a plan limit
  (upstream issue [#108](https://github.com/V1ki/dsh-plugin-subscriptions/issues/108)).
- **Deliberately untracked:** `d8ab13e91fd6747e419a1f5e965bce42bdfc3ad8`
  (the v0.9.6 release chore: version bump plus README notes for the feature
  above). Release mechanics live in this repo's own CI.

## How the baseline was determined

1. `docs/upstream-README.md` is a snapshot of upstream's README; it diffs
   smallest against the `v0.9.5` tag (16 changed lines, all the fork's own
   edits: the proxy-section replacement and peer-range notes).
2. `src/auth/store.ts` and `src/client/fast-command.ts` in this repo are
   byte-identical to upstream at `v0.9.5`; every other shared file differs
   only by the fork's mechanical renames (`proxiedFetch` → `hostFetch`,
   package name) or the deliberate proxy-layer removal.
3. This repo's git history contains every upstream commit through `v0.9.5`
   as a literal ancestor (the repo was derived from a full upstream clone);
   `git merge-base --is-ancestor 75a8346 HEAD` confirms it.

## Re-sync procedure

The shared commit graph makes syncs git-native — no patch archaeology:

```sh
git remote add upstream https://github.com/V1ki/dsh-plugin-subscriptions.git
git fetch upstream --tags
git log --oneline 75a8346..v0.9.6   # replace with the new tag
```

Classify each commit: cherry-pick directly when the touched files survive
here mostly intact; re-implement when the commit targets a rewritten area
(the settings section, the RPC surface, the proxy) and only its intent
applies. After porting, update the Sync point section above: move the
baseline to the new tag, list what was ported or re-implemented on top, and
note any commits deliberately skipped with the reason.

The upstream README snapshots (`docs/upstream-README.md`,
`docs/upstream-README.zh.md`) are refreshed only when the baseline moves;
their header comment records which tag each snapshot matches.

The Cursor transport is a separate vendor record, not an upstream sync:
see [cursor-origin.md](cursor-origin.md).
