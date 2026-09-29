# Prose standard

Contract-first writing for this repo. Write enough to preserve the
contract, then remove reasoning transcripts, repetition, and decoration. A
contract is an obligation, invariant, precondition, postcondition, or
compatibility promise that a reader relies on.

## Preserve the complete proposition

Before editing prose, identify every proposition: actor and action;
condition, timing, and ordering; modality (must, may, never); negative
guarantees and exceptions; ownership, side effects, failure modes, and
consequences. Cut adjectives and narration only when every factual clause
survives and the result is clearer. A smaller word count alone is not an
improvement.

## Required coverage

- **Provider adapter code and JSDoc:** the auth flow, the token shapes the
  parser relies on, and what the fake guarantees versus what only the
  manual canary covers.
- **Comments:** non-obvious contracts or rationale the code cannot express.
  Never restate what the code already implies.
- **Tests:** explain only non-obvious design — why a fixture, assertion, or
  accommodation exists. No walkthroughs, no inventories.
- **Docs:** the consumer contract — configuration, behavior, failures,
  limitations. One home per fact: the compatibility table owns version
  status, `testing.md` owns the layer definitions, agent notes own the
  rationale. Link; don't repeat.

## Repo rules

- English throughout.
- Never cite test counts — they rot on the next commit. Describe the
  suites, not their size.
- Describe coverage at its honest boundary. Cursor is fetch-level covered;
  its HTTP/2 generation transport is not faked. Say so.
