# Development roadmap

This is the execution order for the open items in [PROJECT_CHECKLIST.md](PROJECT_CHECKLIST.md). Updated 2026-10-19 after checking current primary documentation. A stage closes only when its evidence is recorded; implementing code alone does not close a host or release gate.

## Working rule

For each change: state the user-visible behavior and trust boundary, compare the smallest fitting approaches, write a failing check for the concrete risk, implement, then record the observed result and limitations. Keep synthetic retrieval metrics separate from coding outcomes. Do not add a model, background worker, network sync, or automatic approval without evidence that the reviewed local workflow cannot meet the requirement.

## Stage 1 — establish a repeatable baseline

| Work | Why now | Done when |
|---|---|---|
| Version this directory in Git and run pinned-action CI on macOS, Linux, and Windows | Platform claims need hosted logs. GitHub recommends limiting workflow token permissions and pinning action dependencies. | Done: [three hosted jobs](https://github.com/hasebusman/agent-lesson-loop/actions/runs/39165177850) passed on commit `a428eec` with Node 24.22.0. |
| Validate the portable skill with the Agent Skills reference validator and then invoke it manually in three real agent hosts | The [specification](https://agentskills.io/specification) provides a validator, while static format validity does not prove discovery or correct behavior in a host. | Validator output, tool version/commit, and three versioned host smoke records show lookup, suppression, and unchanged source files. |
| Record architecture decisions and host capability contracts | The current proposal has alternatives, but a future adapter needs an explicit, testable contract before it can safely consume messages or write user settings. | ADRs cover storage, trust/approval, retrieval, and each qualified host; fixtures contain exact observed payloads and output behavior. |

**Progress:** The public repository and hosted CI were established on 2026-10-19. The skill passed `skills-ref validate skills/learn-from-corrections` using the Agent Skills reference repository at commit `69ef37e9424c0a7ea9dd2293b559e43ec8176379` on the same day. This is format validation only. [ADR 0001](docs/adr/0001-reviewed-local-lessons.md), [ADR 0002](docs/adr/0002-explicit-check-evidence.md), and [ADR 0003](docs/adr/0003-explicit-version-context.md) record local design choices. Two of the three planned manual host smoke tests have completed.

An isolated smoke attempt with installed Claude Code CLI 1.0.90 reached `Invalid API key` before a model request; it did not establish hook injection. The adapter's `command` plus `args` form and `additionalContext` output match the current [hook reference](https://code.claude.com/docs/en/hooks), but that reference is newer than the installed CLI. Repeat with an authenticated, versioned host before marking it supported.

An explicit Codex CLI 0.145.0 run in a temporary read-only sandbox read the project skill, selected an approved synthetic lesson for an auth fix, suppressed it for a redesign, and left source files unchanged. An earlier CLI-only run revealed that lookup commands used write-capable store setup. They now use the read-only opener, with a permission-bound regression test. This is one explicit-use host smoke result, not unprompted skill-selection or coding-outcome evidence. The [OpenAI Docs skill evaluation guidance](https://developers.openai.com/blog/eval-skills) supports checking trace commands and artifacts rather than scoring only final wording.

An isolated Copilot CLI 1.0.77 run discovered and loaded the project skill after explicit invocation. The trace shows `search` and `explain` calls, selection of the approved synthetic auth lesson, suppression for the redesign exception, and no repository edits. This establishes one explicit-use path, not unprompted skill selection or coding benefit. A Gemini CLI 0.1.5 attempt stopped at Google sign-in before model or skill execution and cannot count as a third host result. The next host test needs working authentication and the same trace and unchanged-file checks.

The [constructed skill behavior cases](evals/skill-behavior.md) now separate correction capture from ordinary work and pasted transcripts. They are a manual review set, not a passed host evaluation.

## Stage 2 — close core safety and correctness gaps

1. **Evidence model:** Separate `human_review`, `developer_attestation`, and machine-observed test/diff checks. Capture an observed record only from an explicitly invoked, bounded command with its arguments, runtime/platform, exit status, timestamp, and output disposition. Discard command output by default: arbitrary output cannot be reliably scrubbed of secrets. Preserve existing records and use a private backup plus reversible migration if a schema change is needed. Acceptance: a free-text claim cannot become a machine result; failed/unknown checks remain labeled; old lessons still retrieve correctly.
2. **Applicability and conflicts:** Add dependency/platform version bounds with explicit unknown-version abstention for technical facts. Build conflict fixtures with differing but overlapping triggers, exceptions, and required terms. Acceptance: stale advice and unresolved contradictions suppress; `explain` gives the reason. Avoid a general graph until fixtures show deterministic rules cannot express the cases.
3. **Adversarial and state tests:** Add property/fuzz input tests, multiple-process write tests, migration interruption/restore tests, and canaries for private data and prompt injection. Acceptance: invariants hold under generated inputs; failure leaves the store recoverable; no canary appears in database, export, or hook output.
4. **End-to-end cost:** Measure hook startup, Git identity, database read, selection, and rendered context with a stated machine and 10,000 lessons. Count tokens with the target host tokenizer or record the exact approximation. Acceptance: publish p50/p95 and token distribution, plus negative results. The original sub-millisecond report measures only in-process lookup.

**Progress:** The scale script now measures the complete local hook subprocess. Three [local observations](evals/reports/hook-process-observations.md) yielded 150.9 ms, 98.6 ms, and 95.9 ms p95; the target is still unverified because scheduling varied and the runs did not include a live host or tokenizer count.

The project-scope regression test confirms that an explicitly remembered app palette is retrieved only in its own repository, including when another repository shares the stack. The portable skill states this boundary and does not encode the palette as a general rule. The first evidence-model increment now distinguishes human review, developer reports, and explicitly run check results. Failed and unknown exits keep their labels; output is discarded, and a content revision does not carry a prior observed check forward as current proof. [ADR 0002](docs/adr/0002-explicit-check-evidence.md) records why existing immutable revisions and schema v2 were reused without a database migration. Full provenance/security review remains open.

Explicit platform/dependency bounds now suppress technical advice when the context is unknown or outside a stable numeric version range. Pending revisions expose changed decision fields through `review --diff`. New focused tests cover a concurrent revision race, restoration from a migration backup, and a private output canary across store, export, and hook output. Semantic conflict detection, broader fuzzing, and host qualification remain open.

A retrieval regression exposed that `explain` could mark a lesson eligible while `search` omitted it when its trigger appeared after the first 30 distinct task words or had one character. Candidate lookup now includes every word in the bounded task input and uses SQLite's [FTS5 column filter](https://sqlite.org/fts5.html#fts5_column_filters) for triggers, so unrelated words in lesson titles and bodies do not expand the candidate set. Synthetic 180-term ASCII and 400-term Unicode tasks and the 10,000-lesson scale run pass locally. This does not resolve semantic conflicts between lessons.

The [Node 24 SQLite documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) still labels `node:sqlite` a release-candidate API. Keep the pinned 24.x runtime and migration/backup tests while the project depends on it. Do not change database engines solely to avoid that label; change if compatibility runs or API churn reveal a concrete failure.

## Stage 3 — qualify integrations one host at a time

1. **Claude Code:** Use an isolated test HOME and repository. Verify the installed CLI/IDE version, actual `UserPromptSubmit` payload, optional lookup output, timeout, disable, malformed input, and exact uninstall. The [Claude hook reference](https://code.claude.com/docs/en/hooks) says the prompt still proceeds if a command hook times out unless configured to block; our advisory path must remain fail-open. Record both CLI and IDE results before labeling them supported.
2. **Cursor:** First verify whether a non-blocking hook can add advisory context on the target version. The current [Cursor hooks documentation](https://cursor.com/docs/hooks) lists `beforeSubmitPrompt` output as `continue` and `user_message`; it does not show Claude's `additionalContext` contract there. Keep the portable skill/manual CLI as the supported path until a live fixture proves a safe context path. Do not use `afterAgentThought` for private reasoning or `stop` to force another turn.
3. **Correction proposals:** Only after a host supplies an authenticated direct-user event and a suitable outcome signal, add opt-in drafting with stable event IDs and duplicate-delivery tests. Drafts remain inactive until human review. Do not store raw transcripts by default.
4. **Other hosts:** Qualify each against its own documented and observed capability; do not copy another host's hook payload or install format.

## Stage 4 — demonstrate benefit before expanding technique

Obtain consented, scrubbed real corrections using the [intake guide](docs/correction-intake.md), and the original v0.1 archive if it ever becomes available. One example is enough to review the lesson format; a broader study needs a diverse corpus. Without the archive, retain the explicitly documented importer gap; without real corrections, do not claim coding improvement. Freeze baseline/treatment task commits, tests, and review criteria before runs. Compare no lesson, approved lesson, and irrelevant/conflicting lesson conditions; measure first-pass success, repeated corrections, regressions, unrelated edits, proposal acceptance, and total latency. Require blind review and publish negative outcomes. The synthetic 30-case suite remains a regression check, not proof of developer benefit.

Only test embeddings or model-assisted drafting if the measured failure mode is retrieval recall or proposal quality that the deterministic system cannot fix simply. Compare the added quality with privacy exposure, cost, runtime, and explainability. A winning technique must pass the same negative-control and security gates before adoption.

## Stage 5 — beta release

Complete a documented security review and host/version matrix, dependency and license audit, adversarial test corpus, installation and removal tests, and release notes. Add reproducible build artifacts and provenance only when there is a real published artifact: [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations) bind an artifact to the workflow, repository, and commit. Keep release permissions narrower than build permissions. Close the numerical targets in the architecture plan with observed reports, and block beta on any critical privacy, permission, or corruption finding.

## Explicit dependencies

- A hosted CI run requires a Git remote/repository. Local tests cannot substitute for macOS/Linux/Windows runner evidence.
- Live agent smoke tests require installed, accessible host versions. A passing hook fixture is not a live host test.
- v0.1 import compatibility requires the actual archive or a trustworthy format specification.
- A real-world effectiveness claim requires consented correction data and completed A/B outcomes. The user has said no such data is available now.
- Phase 6 options in the architecture plan remain research work after beta, not blockers for the local manual MVP.
