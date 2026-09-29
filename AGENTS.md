# Repository prose standard

These rules apply to project-authored code, tests, documentation, UI text,
diagnostics, and Agent Notes. Follow [docs/AGENTS.md](docs/AGENTS.md) for
documentation placement and [.agents/notes/AGENTS.md](.agents/notes/AGENTS.md)
for decision records.

Write enough to preserve the contract, then remove reasoning transcripts,
repetition, and decoration. Before trimming prose, preserve its actor and
action; conditions, timing, and ordering; must/may/never distinctions;
exceptions; ownership; side effects; failures; and consequences. Shorter text
is useful only when those facts survive and the result is clearer. Add or
restore prose when code and types do not communicate a needed contract.

Keep behavior, failures, ownership, and consequences where a caller or
maintainer needs them. Give a full explanation one home and link to it for
rationale, algorithms, or history; essential contract facts may repeat at
their point of use. Keep non-obvious rationale nearby when omitting it could
cause misuse or an incorrect simplification. Name the exact API, field, check,
or failure before using broad terms such as "surface" or "gate".

## By location

- **Public JSDoc:** document caller-visible return distinctions, failures,
  side effects, ownership, timing, cancellation, and durability where they
  are not clear from the type and implementation.
- **Internal and module comments:** explain non-obvious invariants, race
  ordering, security boundaries, responsibilities, and surprising failures.
  Do not narrate control flow or restate code.
- **Tests:** explain why a non-obvious fixture, assertion, accommodation, or
  real entry path is necessary. Do not inventory tests or walk through them.
- **README and docs:** state configuration, behavior, failures, limitations,
  and observable verification. Link to the owner of extended detail.
- **Agent Notes:** retain unique rationale, genuine alternatives, consequences,
  shipped verification evidence, and named coverage gaps. Implemented notes
  describe current behavior, not a completed task list.
- **UI and model-visible text:** wording is behavior. Inspect changed UI copy
  in its rendered context, including accessibility names and tooltips; check
  tool descriptions and results through their owning request path.
- **Diagnostics:** name the failed subject, violated rule, and correction
  when they are not obvious. Do not narrate internal execution.

For prose-only work, leave `vendor/cursor/` and the upstream README snapshots
in `docs/` as imported. Change their owning source or sync them explicitly
when the task requires it. Edit source before generated `lib/` output and
rebuild derivatives instead of hand-editing them.
