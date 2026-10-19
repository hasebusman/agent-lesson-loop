# ADR 0005: Reviewed links for known conflicting lessons

Status: Accepted, 2026-10-19.

## Context

ADR 0004 abstains when approved lessons have identical triggers and exceptions but ambiguous required context. Two contradictory lessons can instead use different triggers, exceptions, or required terms. A task may satisfy both. Text overlap alone cannot establish that their advice contradicts: two lessons about login may address separate parts of the work.

## Decision

A developer may link a draft to another approved lesson in the same project with `--conflicts ID`. The link is a decision field in the reviewed, immutable revision and its content hash. Retrieval treats it symmetrically: if both linked lessons are eligible for the current task, both abstain and `explain` names the linked ID. A link to a lesson that is out of scope, expired, retired, excluded, or otherwise ineligible does not suppress the applicable lesson. Removing a link requires a reviewed revision. Existing records have no links and retain their hashes.

The CLI checks the target ID when the link is drafted. A target later deleted or retired leaves an inert link in history. This is safe for retrieval and can be cleaned up through a revision.

## Alternatives considered

- Group every lesson with overlapping trigger words: common terms such as `auth` would suppress independent advice.
- Infer contradictions from lesson prose: this would require representative reviewed corrections, a measured false-positive/false-negative profile, and an additional model or rule layer. No such corpus is available.
- Add a general conflict graph and automatic deduplication: the reviewed link and pairwise applicability check cover the known case with less state and no migration.

## Evidence and limits

A constructed contradictory pair with different triggers, exceptions, and required terms is suppressed only when both are eligible. A 64-case applicability matrix compares `search` and `explain`; tests also cover cross-project and self links, pending removal, and rollback. These tests establish deterministic handling of **declared** conflicts. They do not detect undeclared semantic contradictions or prove that developers choose correct links on real corrections.
