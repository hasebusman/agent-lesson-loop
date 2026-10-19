# ADR 0004: Trigger candidates and conservative overlap

Status: Accepted, 2026-10-19.

## Context

An approved lesson is eligible only when the task contains at least one trigger and all required-context terms, with no matching exception. `search` previously let FTS5 see only the first 30 distinct task words of length two or more. A lesson could therefore be eligible in `explain` yet absent from `search`. A separate overlap rule treated the *number* of required terms as specificity, even when two sets of terms were incomparable.

## Decision

The CLI and hook bound task input to 1,000 characters. Candidate lookup sends all words in that bounded input to SQLite FTS5 and matches the indexed trigger column. The same deterministic eligibility checks then run on every candidate. FTS5 narrows work; it does not decide whether a lesson applies.

For lessons sharing triggers and exceptions, project scope takes priority over stack, then global. Within the highest applicable scope, a lesson shadows another only when its required-context set strictly contains the other's. If two maximal sets are equal or incomparable, both are suppressed and `explain` reports ambiguity. This rule does not infer whether the lesson bodies agree or conflict.

## Alternatives considered

- Keep the first-30-word filter: faster query construction, but silently misses valid late or one-character triggers.
- Search all indexed text: finds candidates through titles or advice bodies that cannot satisfy a trigger, increasing unnecessary decoding.
- Rank by required-term count: simple, but an unrelated two-term condition can hide a one-term condition without being narrower.
- Model semantic contradiction: may detect more cases, but needs representative reviewed examples and an error model before it can safely suppress or merge advice.

## Evidence and limits

The regression tests cover late ASCII and Unicode task terms, one-character triggers, strict narrowing, equal applicability, incomparable contexts, and scope priority. The [34-test three-OS CI run](https://github.com/hasebusman/agent-lesson-loop/actions/runs/39201107445) and both synthetic evaluations passed. The 10,000-lesson local scale run completed after the FTS change. These checks establish deterministic behavior on constructed cases; they do not measure coding benefit or semantic conflict recall on real corrections.
