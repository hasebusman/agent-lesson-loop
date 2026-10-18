# Agent Lesson Lab implementation plan

This plan turns the [architecture proposal](agent-learning-system-architecture-plan.md) into a build with observable acceptance. The proposal's later research options are not release requirements: a daemon, remote sync, embeddings, and automatic promotion would add authority or data flow without evidence of need.

**Status:** The build order below is complete for the local manual workflow and qualified fixture-tested Claude lookup path. It does not mean the architecture proposal's phase gates or cross-agent beta are complete. See the [development status checklist](PROJECT_CHECKLIST.md) for verified work and remaining evidence.

The [development roadmap](DEVELOPMENT_ROADMAP.md) orders the remaining work by evidence and risk, with a reason and completion criterion for each stage.

## Acceptance

1. A direct developer correction can become a minimal draft, be reviewed and explicitly approved, and be retrieved for a relevant task in the same repository. A conflicting request suppresses it. Disable, retire, and rollback work without editing source repositories.
2. The persisted record has validated provenance, evidence labels, immutable revisions, project identity, negative applicability, expiry, audit history, privacy filtering, and transactional migration/backup. No user-supplied text is treated as proof that a test ran.
3. The CLI covers the documented local lifecycle: init, doctor, capture, review, approve, reject, search, explain, retire, rollback, export, delete, disable, and uninstall. Errors in advisory lookup cannot block the host's task.
4. The portable skill follows the published format. Claude Code has an opt-in read-only adapter with payload fixtures, installer preview/backup/idempotence, and exact removal of its owned entry. Cursor and other hosts use the manual skill until a task-specific, safe context contract and live behavior are verified.
5. A reproducible synthetic fixture suite covers at least 30 retrieval cases and reports accuracy, suppression, output size, and lookup time. Tests cover concurrent writes, migration, project isolation, secret canaries, injected content, installer safety, and host fail-open behavior.
6. The repository has runnable setup and release documentation, a 3-OS CI test matrix, security and privacy notes, and an explicit compatibility table. Claims of real-world effectiveness or host support require their own observed evidence.

## Build order

- [x] Freeze contracts, policy precedence, and local storage boundaries in code and docs.
- [x] Complete the transactional core, lesson lifecycle, scope/relevance policy, and CLI.
- [x] Implement the qualified opt-in Claude lookup adapter and safe integration management; document manual fallback for other hosts.
- [x] Add the evaluation corpus, focused security/concurrency tests, and performance report.
- [x] Finish portable skill, documentation, CI configuration, and local verification.

## External evidence

The v0.1 ZIP and the 10–20 real reviewed mobile corrections mentioned in the proposal are absent. A v0.1 importer cannot be implemented faithfully without its actual format, and exact compatibility or real-world effectiveness cannot be certified. The local manual workflow is implemented and passes its local tests; the broader release gates remain open. Hosted three-OS CI and live agent behavior also require runs outside this workspace. The checked-in workflow, compatibility table, and status checklist state that boundary.

## Research-based refinement

The [technique comparison](docs/research-comparison.md) reviews current agent-memory and software-engineering evidence. The selected refinement adds optional all-required subtask context to approved lessons while retaining the review gate, local store, FTS5 candidate search, and deterministic safety filters. A paired synthetic retrieval comparison is checked in at [evals/reports/subtask-comparison.json](evals/reports/subtask-comparison.json). It establishes only behavior on constructed cases, not real coding improvement.
