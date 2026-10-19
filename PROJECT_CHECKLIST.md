# Development status checklist

Checked against the [project architecture and release gates](agent-learning-system-architecture-plan.md), [implementation plan](IMPLEMENTATION_PLAN.md), [development roadmap](DEVELOPMENT_ROADMAP.md), and repository on 2026-10-19. **Current stage: working local manual MVP; cross-agent beta not reached.** The implementation plan's five local build steps are complete, but its broader phase gates remain open. A checked box means the named behavior has local evidence, not that host compatibility or effectiveness is established.

## Status at a glance

- [x] Local draft → review → approve → scoped search/explain → revise/retire/rollback workflow works in tests.
- [x] A project-specific preference stays in its repository; it is not written into the portable skill or returned in another repository's search.
- [x] Human review, developer-reported outcomes, and explicitly run command results have distinct labels; check output is discarded.
- [x] Portable skill passes the Agent Skills format validator; optional Claude lookup hook passes local fixture tests.
- [x] Hosted CI passed on macOS, Linux, and Windows with Node 24.22.0 for the 33-test retrieval revision ([run](https://github.com/hasebusman/agent-lesson-loop/actions/runs/39200574089)).
- [ ] Three real manual-skill hosts and live Claude CLI/IDE behavior are verified. Isolated Codex CLI 0.145.0 and Copilot CLI 1.0.77 runs read or loaded the project skill and selected and suppressed the expected synthetic lesson. A third host, unprompted skill selection, and live Claude behavior remain unverified; Gemini CLI 0.1.5 stopped at sign-in.
- [ ] Real correction data, a coding-outcome A/B study, and the public-beta safety/performance gates are complete.

The repository is [public under hasebusman](https://github.com/hasebusman/agent-lesson-loop). The v0.1 archive and consented real corrections are unavailable. Phase 6 research options are deferred choices, not missing MVP features.

## Phase 0 — specification and baseline: partial

- [x] Define the local lesson contract, review policy, repository identity, and threat model ([model](src/model.ts), [project identity](src/project.ts), [threat model](docs/threat-model.md)).
- [x] Create 30 reproducible synthetic retrieval fixtures and JSON reports ([evaluation](docs/evaluation.md), [baseline report](evals/reports/synthetic-baseline.json)).
- [ ] Inspect and preserve the referenced v0.1 ZIP, create regression fixtures for its actual format, and implement its importer. The ZIP was not supplied; the existing v1 **internal SQLite schema** migration is a different format.
- [ ] Assemble 10–20 consented, reviewed, scrubbed real mobile corrections. None were supplied; synthetic lessons cannot establish real-world effectiveness.
- [x] Record [ADR 0001](docs/adr/0001-reviewed-local-lessons.md) for reviewed local lessons and [ADR 0002](docs/adr/0002-explicit-check-evidence.md) for evidence provenance and output retention.
- [ ] Record remaining retrieval/host decisions and freeze observed host event contracts before qualifying further automatic adapters.

## Phase 1 — reliable local core: partial gate

- [x] Implement local SQLite transactions, WAL, internal v1-to-v2 migration with backup, immutable revision history, rollback, export, deletion, and disable ([store](src/store.ts), [CLI](bin/lessonlab.ts)).
- [x] Implement Git repository and worktree identity, project isolation, reviewed approval, separate broader-scope promotion, expiry, input filtering, and deterministic FTS5-assisted retrieval with `explain` ([tests](tests/workflow.test.ts)). FTS candidates now match trigger text and retain every task term, including a late or one-character trigger within the bounded 1,000-character input.
- [x] Exercise concurrent first-run capture, process-kill rollback, canary patterns, tampered records, and source-repository non-modification in local tests ([tests](tests/workflow.test.ts)).
- [x] Add a concurrent same-lesson revision race test, restore from a pre-migration backup, and verify a check-output canary stays out of the database, export, and hook output ([tests](tests/workflow.test.ts)).
- [ ] Add broader property/fuzz inputs, migration-interruption cases, and adversarial privacy cases. A deterministic token-family fuzz check covers varied synthetic lengths and common GitHub token prefixes; a retrieval regression covers 180 ASCII terms, 400 Unicode terms, and a one-character trigger. Filtering still cannot guarantee removal of all sensitive data.
- [x] Separate human review, developer-reported outcomes, and explicitly run command checks; retain pass/fail/unknown, discard command output, and keep old checks in history after a lesson edit ([model](src/model.ts), [CLI](bin/lessonlab.ts), [tests](tests/workflow.test.ts)). This records an observed process result, not proof that the lesson improves coding outcomes.
- [x] Add explicit platform/dependency version bounds with conservative abstention for missing, mismatched, or unsupported versions ([ADR 0003](docs/adr/0003-explicit-version-context.md), [tests](tests/workflow.test.ts)).
- [ ] Resolve semantic conflicts and dedupe beyond identical applicability. No semantic conflict detector is claimed yet.
- [x] Show changed lesson content and scope between an active revision and pending draft with `review ID --diff` ([tests](tests/workflow.test.ts)).
- [x] Observe passing CI runs on macOS, Linux, and Windows. [Run 39200574089](https://github.com/hasebusman/agent-lesson-loop/actions/runs/39200574089) passed on commit `07ce16f0fb846820199db590c1d30c2613dfae18` with Node 24.22.0, the 33-test suite, and pinned current actions. Ubuntu is explicitly 24.04 to avoid an in-progress `ubuntu-latest` image migration.

## Phase 2 — portable skill and manual workflow: implemented, gate unverified

- [x] Provide a portable [Agent Skill](skills/learn-from-corrections/SKILL.md), manual capture/review/approve workflow, and CLI `search`/`explain`; no hook or collection is enabled by default. Lookup, review, history, doctor, and export now open the store read-only.
- [x] Run the Agent Skills reference validator. `skills-ref validate skills/learn-from-corrections` passed on 2026-10-19 using reference commit `69ef37e9424c0a7ea9dd2293b559e43ec8176379`; this checks format, not host behavior.
- [ ] Manually invoke the skill in at least three real coding agents, recording host versions and whether source repositories remain unchanged. Explicit Codex CLI 0.145.0 and Copilot CLI 1.0.77 runs read or loaded the skill, used `search`/`explain` correctly with synthetic data, and did not edit the fixture repository. A third host and unprompted skill selection remain unverified. Gemini CLI 0.1.5 required Google sign-in before the task could run.

## Phase 3 — opt-in adapters: partial

- [x] Implement an optional, read-only Claude Code `UserPromptSubmit` lookup hook with dry-run, backup, idempotent install, exact owned-entry removal, payload fixtures, and fail-open behavior ([integration](src/integrations.ts), [hook](bin/hook.ts), [tests](tests/workflow.test.ts)).
- [ ] Run live Claude Code CLI and IDE smoke tests against documented versions, including install, disable, malformed payload, and uninstall.
- [ ] Implement and qualify a Cursor adapter after confirming its safe host contract; the current Cursor path is manual skill/CLI use.
- [ ] Implement opt-in correction candidate drafting, outcome detection, normalized event IDs, and duplicate-delivery handling. Current capture is explicitly manual.

## Phase 4 — relevance and effectiveness: partial

- [x] Use SQLite FTS5 candidates and deterministic scope, trigger, required-context, exception, and expiry checks ([retrieval](src/retrieve.ts)). The [synthetic baseline](evals/reports/synthetic-baseline.json) selected 15 expected lessons and suppressed 15 negatives; the [scale report](evals/reports/synthetic-scale.json) covers 10,000 lessons on one macOS machine.
- [x] Compare generic versus required-subtask terms on constructed cases ([paired report](evals/reports/subtask-comparison.json)).
- [x] Measure the complete local hook subprocess on 10,000 synthetic lessons and publish three local runs ([timing observations](evals/reports/hook-process-observations.md)); observed p95 values were 150.9 ms, 98.6 ms, and 95.9 ms, so the sub-150 ms release target is not yet established.
- [ ] Measure end-to-end host overhead and rendered **token** counts, not only in-process lookup time and characters.
- [ ] Measure selection quality and side effects on real tasks; usage counts, human acceptance, and harmful-lesson handling remain unverified beyond manual retire/rollback.
- [ ] Run a preregistered coding A/B study with real reviewed corrections, frozen tasks, negative controls, observed tests, and blind review. Measure repeated-correction reduction, regressions, and human acceptance before any effectiveness claim.
- [ ] Evaluate opt-in model-assisted proposal generation only if manual drafting shows a measured quality or time problem. No provider is connected now; this is conditional research, not an MVP blocker.

## Phase 5 — cross-agent beta and release: not reached

- [x] Include Apache-2.0, README, privacy/security/contributing/conduct/changelog/compatibility documentation, SHA-pinned, read-only-permission CI actions, weekly dependency update checks, and private vulnerability reporting ([compatibility](COMPATIBILITY.md), [CI](.github/workflows/ci.yml), [Dependabot](.github/dependabot.yml)).
- [ ] Verify a host/version matrix for Claude, Cursor, and at least three manual-skill hosts, plus supported operating systems. Other automatic adapters remain unqualified.
- [x] Review locked dependency licenses and npm advisories ([review](docs/dependency-review.md)); `npm audit` reported zero vulnerabilities on 2026-10-19.
- [ ] Add remaining release artifacts and process: remaining ADRs, dedicated quickstart/troubleshooting documentation, a broader security review and adversarial scans, build artifacts with provenance/checksums when published, and host qualification.
- [ ] Demonstrate release gates in a documented environment: approved-only retrieval, separate global approval, zero published canary leaks/critical boundary failures, negative suppression target, end-to-end p95 target, install/disable/crash/uninstall behavior, and no material negative-control degradation.

## Phase 6 — after beta: deferred by design

- [ ] Evaluate semantic retrieval, multi-device export/sync, broader agent/model coverage, and any narrow auto-promotion only after beta evidence. Silent policy updates are outside the current design.

## Next work, in order

The evidence gates, approach comparisons, and acceptance criteria are in the [development roadmap](DEVELOPMENT_ROADMAP.md).

1. Complete a third manual-skill host smoke test and live Claude CLI/IDE tests with exact host versions and observed payloads. The Gemini CLI attempt requires authentication before it can count.
2. Extend the local core with conflicting-condition fixtures and property/adversarial tests. Measure tokens and host overhead before asserting the performance gate.
3. If a v0.1 archive becomes available, verify and import its actual format. If consented real corrections become available, freeze an A/B study and measure outcomes; otherwise make no compatibility or effectiveness claim.
4. Qualify Cursor and further adapters only after their contracts and smoke tests are repeatable. Complete the beta security/release review after the evidence gates pass.

**Proof for this audit:** The current 33-test suite, `npm run check`, `npm run eval`, `npm run eval:compare`, and the 10,000-lesson scale run passed locally on macOS with Node 24.22.0 on 2026-10-19. The linked [hosted CI run](https://github.com/hasebusman/agent-lesson-loop/actions/runs/39200574089) passed the 33-test revision on three operating systems. Isolated Codex and Copilot CLI smoke traces record skill loading or reading, selection, and suppression. The Agent Skills reference validator passed after the skill change. The checked-in evaluation reports are synthetic reference runs; no coding-outcome result is implied.
