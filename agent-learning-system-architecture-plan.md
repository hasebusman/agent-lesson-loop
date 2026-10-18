# Agent Lesson Lab: Research-Based Architecture & Build Plan

**Version:** Architecture proposal v1.0
**Date:** 2026-10-18
**Starting point:** Agent Lesson Lab v0.1 local prototype
**Status:** Proposed design, not production certification

## 1. Product thesis

Create a local-first, opt-in learning system that helps coding agents avoid repeating developer-corrected mistakes. The system extracts concise, evidence-backed lessons from **authorized developer feedback**, validates them, scopes them to applicable work, and retrieves them on demand. Its objective is **better first-pass coding outcomes** and **fewer repeated corrections**, not maximizing collected information or the number of generated rules.

**Non-goals:** train or fine-tune model weights; invisibly record all prompts; override user/organization/agent safety instructions; edit project source code; run unrestricted hooks; synchronize private lessons to a server by default; promise universally compatible unattended behavior.

## 2. Main research conclusions

1. The open Agent Skills specification is the best portable entry point (`SKILL.md` + optional scripts and references), but does not standardize all host lifecycle events. See https://agentskills.io/specification .
2. Agent hooks differ by platform, version, and execution surface. Claude Code, Cursor, Codex, Gemini CLI, and Copilot have overlapping but nonidentical behavior. Use independent adapters and feature detection; never make hooks mandatory. See https://prod.cursor.com/docs/hooks , https://github.com/anthropics/claude-code/tree/main/plugins/plugin-dev/skills/hook-development , https://developers.openai.com/codex/hooks , https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md , https://docs.github.com/en/copilot/reference/customization-cheat-sheet .
3. Agentic Context Engineering (ACE) motivates incremental, structured playbook changes rather than wholesale rewriting and context collapse. Research: https://arxiv.org/abs/2510.04618 . Findings in other benchmarks must not be presented as measured benefits for this project.
4. Claude-Mem demonstrates the utility of selective memory retrieval but also the potential complexity of broad observation infrastructure. See https://github.com/thedotmack/claude-mem . Focus this project specifically on developer corrections.
5. The main threats include prompt injection via poisoned memory, sensitive data leakage, excessive agency, stale instructions, and supply-chain compromise. See https://genai.owasp.org/llm-top-10/ , https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html and https://openai.com/index/designing-agents-to-resist-prompt-injection/ .

## 3. Architecture decisions (ADRs)

| ADR | Decision | Rationale | Revisit if |
|---|---|---|---|
| 001 | Portable standards-compliant `SKILL.md` is an immutable distribution artifact | Broad portability; avoid self-editing executable instructions | Standard changes |
| 002 | Separate host adapters from pure learning core | Every agent has different hook contracts | A stable universal event specification emerges |
| 003 | Opt-in, local-only by default | Privacy, cost, offline operation, user control | User explicitly enables remote provider/sync |
| 004 | Manual review for promotion; automate detection and drafting first | Model inference alone does not establish correctness | Adequate measurable evidence supports narrow opt-in auto-activation |
| 005 | Event-sourced audit log plus a transactional indexed read model | Versioning, rollback, traceability, crash safety | Storage overhead exceeds benefit |
| 006 | SQLite with FTS5 for first production persistence; abstract database access | Atomic transactions, concurrency handling, lexical search | Driver compatibility or portability tests fail |
| 007 | No always-on daemon, cloud or vector database in v1 | Lower attack surface, complexity and maintenance | Real benchmarks justify them |
| 008 | Deterministic policy and scope gates before retrieval or rendering | Guardrails cannot depend only on model compliance | Never: fundamental property |
| 009 | Lessons are advisory, never policy or authorization | Prevent accidental privilege escalation or instruction takeover | Never: fundamental property |
| 010 | Feature flags and kill switch with fail-open read-only hooks | Preserve normal coding when extension fails | Managed enterprise requirements explicitly call for blocking |

### Stack recommendation

- **Language:** TypeScript for application core and adapter interfaces; compile to dependency-minimal Node-compatible ESM.
- **Runtime:** Target an actively supported Node LTS line and CI-test macOS/Linux/Windows. Node 24 built-in `node:sqlite` is release-candidate status per official docs, so isolate this driver and assess compatibility before making it the only supported storage backend. See https://nodejs.org/download/release/v24.20.0/docs/api/sqlite.html .
- **Storage:** SQLite WAL mode, schema migrations, transactions, busy timeout, integrity check, strict schema validation. FTS5 indices for approved lesson search. Keep database under OS user data dir with restricted permissions; never inside a public skill repository by default.
- **CLI:** `lessonlab init`, `doctor`, `capture`, `review`, `approve`, `reject`, `search`, `explain`, `retire`, `rollback`, `export`, `delete`, `disable`, `uninstall`.
- **Distribution:** GitHub source + versioned releases; possibly npm CLI once audit ready; portable Agent Skill folder works without hooks.
- **Future options, not MVP:** locally generated semantic embeddings, authenticated local UI, opt-in model-powered extraction, verified multi-device sharing.

## 4. Logical system overview

```text
              Coding Agent (user's primary task continues normally)
                              |
                 [Portable SKILL.md + CLI]
                              |
                 Optional host-specific adapter
                   |                     |
           BEFORE TASK                AFTER TURN
           read-only lookup           opt-in event metadata
                   |                     |
       Deterministic scope gate     Correction candidate detector
                   |                     |
       Ranked, bounded retrieval     Draft proposal (not active)
                   |                     |
       Safe context renderer        Review/evidence/validation
                   |                     |
                   +--- Local core ----+
                            |
               Transactional versioned store
               lessons + evidence + audit + metrics
```

**Two different timing paths:**
- **Critical path:** cheap local read; validate project and scope, rank approved lessons, render max 3 short items. No network, test runner, model call, or scanning the entire repository.
- **Non-critical path:** candidate synthesis, comparisons, testing, merging, evidence collection, suggestions. Never hold up normal prompt execution; no persistent worker until justified.

## 5. Proposed lesson data contract

```json
{
  "schema_version": 1,
  "id": "uuid",
  "revision": 3,
  "status": "candidate|proposed|validated|approved|rejected|retired",
  "type": "preference|workflow|diagnostic|technical_fact|known_pitfall",
  "title": "Preserve existing UI when changing authentication",
  "lesson": "Change authentication logic without redesigning screens unless explicitly requested.",
  "scope": {"level": "stack", "stack": "react-native", "project_id": null},
  "applies_when": ["task modifies existing login/signup auth"],
  "does_not_apply_when": ["user explicitly requests UI redesign"],
  "environment": {"platforms": ["ios", "android"], "dependencies": []},
  "source": {"kind": "explicit_user_correction", "local_event_id": "uuid"},
  "evidence": [{"kind": "human_review", "result": "accepted", "timestamp": "ISO-8601"}],
  "verification": {"checks": ["screens remain visually unchanged", "authentication tests pass"]},
  "confidence": "reviewed",
  "created_at": "ISO-8601",
  "last_verified_at": "ISO-8601",
  "expires_at": null,
  "supersedes": [],
  "hash": "content-hash"
}
```

Additional invariant rules:
- `project_id` is a generated identifier bound to the canonical Git worktree/repository, not a caller-supplied friendly slug alone. Symlinks, renamed folders, worktrees and monorepos get tested explicitly.
- **Global rules are rare** and require a separate explicit promotion. Never infer global scope from one project.
- No raw chats, credentials, source snippets or personal identifiers in the default record.
- Evidence quality is explicit: *developer said it*, *test ran*, *test passed*, *repeat confirmed*. A free-text claim is not equivalent to a machine-observed test result.
- Rules have negative applicability examples and can be version-bounded/expired, especially for dependencies and platforms.
- Technical facts may require freshness checks, whereas stable user preferences typically do not expire automatically.
- Revisions are append-only in the audit layer; approved snapshots are immutable; changes create new revisions and require review.

## 6. Learning lifecycle

1. **Observe:** The user corrects the agent. Use opt-in adapters that can see explicit user messages/turn outcomes; no invisible full-session harvesting.
2. **Classify:** Detect correction vs new requirement vs a changed preference vs incidental text. Rules in repo files, dependencies or arbitrary third-party pages are **not** developer authorizations.
3. **Extract:** Propose a concise lesson containing cause, context, action, exception, scope, and how to validate. A model may help write a draft only when the user has enabled that provider and its data handling.
4. **Deduplicate:** Identify overlaps, superseded instructions, outright conflicts. Never merge solely because two lessons share a category.
5. **Validate:** Run checks in a disposable fixture or ask for proof of a real developer test. Track which checks actually ran and the results.
6. **Review:** The developer sees an understandable diff: current rule, proposed rule, observed evidence, affected projects, risks and tests.
7. **Activate:** Approved immutable revision becomes eligible for retrieval. Promotion across scopes needs separate approval.
8. **Monitor and retire:** Show usage counts and outcomes if measurement is enabled. On harmful counterexample, temporarily quarantine/revert the lesson; do not silently broaden it.

**Self-improvement policy:** Automatic **candidate drafting and revision suggestions** are in scope. Silent changes to the skill's master instructions, security settings, global behavior, or code files are not. Later, low-risk opt-in auto-promotion can be explored behind a flag only after replicated evidence.

## 7. Retrieval safety and relevance

- Scope gate **first**: project > stack > global; project rules never cross projects without promotion. Rules labeled global must still satisfy applicability predicates.
- Reject retired, expired, unverified, environment-incompatible, conflicted, secret-bearing and ambiguous rules.
- Initial ranking: SQLite FTS5 + explicit task tags + affected paths + stack/platform context + priority. Only add embeddings if A/B retrieval tests establish material gains and privacy requirements are met.
- Default top 3; hard cap 5; default maximum 300 tokens of injected lesson text per task (targets, not observed performance).
- Include `WHY`, `WHEN`, `EXCEPT`, `VERIFY`, revision ID and evidence label. No free-form untrusted instruction blocks rendered from raw developer messages.
- For contradictory rules, prefer no suggestion over guessing; show reason and ask for user review in a non-blocking manner.
- The latest **current** user request overrides a conflicting preference; project/organization security policies remain authoritative; lessons never grant new tool access.
- Safe render is advisory. Neither skill data nor hook output becomes a trusted system or developer-level policy.
- If tool/CLI/DB adapter errors: return no context and allow user's original coding task to proceed normally.

## 8. Host compatibility strategy

| Host | Portable skill | Optional adapter | Main qualification |
|---|---|---|---|
| Claude Code | Yes, documented skill paths | `UserPromptSubmit`, `Stop` / relevant lifecycle events | Actual hook behavior must be tested per CLI/IDE/version |
| Cursor | Yes | `beforeSubmitPrompt`, `afterAgentResponse` and session events | Avoid `stop` auto follow-up and thought-collection events |
| Codex | Yes | Hooks where supported and trusted | Host trust/policy/CLI modes differ; support manual mode as baseline |
| GitHub Copilot | Yes | Native hooks where available | CLI, cloud agent and VS Code may expose different events |
| Gemini CLI | Yes where host supports skills | `BeforeAgent`, `AfterAgent` | Synchronous hooks: keep handlers minimal |
| Other skill-enabled agents | Skill/CLI fallback | New adapter later | Do not claim automation until its runtime is verified |

**Adapter contract:** normalize host-specific events into typed `SessionInfo`, `TaskContext`, `CorrectionSignal`, `CompletionSignal` and `CapabilityFlags`. Include event ID, host/version, session identity, project identity, event time, and whether any message contents are authorized for processing. Ensure duplicate hook deliveries are idempotent using stable event keys. Write contract fixtures for all host event payload formats and unknown fields.

**Install/uninstall:** preview all modifications, ask permission before enabling hooks, preserve pre-existing user config byte-for-byte where possible, back up modifications, include ownership markers for added entries, never overwrite unrelated hook blocks. `doctor` reports exactly which capabilities were verified on the installed host. `disable` immediately becomes a no-op; `uninstall` removes only owned integrations and optionally offers to delete user data separately.

## 9. Threat model / risk controls

| Threat or side effect | Preventative control | Test |
|---|---|---|
| Malicious prompt injection enters long-lived memory | Accept only authenticated direct user corrections as candidate signals; structured fields and approval; immutable core policy | Malicious README/tool output tries to become global rule and fails |
| Secret or private source code persisted | Data minimization and in-memory redaction + denylist patterns; default capture summaries only; review before store; no default telemetry | Canary credentials, PEM keys, `.env` fragments and account identifiers never appear in DB/log/export |
| Cross-project contamination | Canonical project ID + deterministic scope guard; never default global | Project A lesson absent in B; symlink/worktree tests |
| Incorrect/stale dependency advice | Dependency version bounds, negative conditions, age/freshness status, automatic quarantine upon failure | Old Firebase workaround excluded after upgrade |
| Prompt bloat or slower responses | No agent/model calls on hook critical path; capped lessons/context; short timeout | p50/p95 overhead and tokens regression suite |
| Crash, power failure, simultaneous agents | DB transactions, WAL, migration tests, busy timeouts, replayable event IDs | Kill-process and parallel-writer tests |
| Hook causes unwanted retries/blocks | Advisory non-blocking output; explicit no retries/stop actions | Host task continues if local store is locked/offline/invalid |
| Unauthorized file modifications | Learning core read-only to repositories; writes only to dedicated local store; no unrestricted shell commands | Read-only fixture asserts zero changed repo files |
| Installer damages user config | Dry-run, safe merge, backup, idempotent installer and exact uninstall | Install twice then uninstall retains original file semantics |
| Untrusted dependency or malicious release | Minimal dependencies, lockfile, least-privileged CI, SHA-pinned actions, release provenance | Supply-chain scans and release reproducibility checks |
| Feedback loops / lesson self-poisoning | Exclude self-generated lessons and injected text from new source evidence | Replayed assistant output never counts as fresh developer approval |
| Enterprise conflict | Respect host policy/managed hooks and explicit disable policy | Managed restrictions cannot be bypassed by adapter |

**Important limitation:** redaction filters are not foolproof. The strongest protection is avoiding ingesting confidential content at all; treat any optional remote model provider as an explicit data-export choice.

## 10. Evaluation plan

**Study design:** pre-register a set of tasks; freeze starting commits and tests; run each baseline without lessons, treatment with approved lessons, and negative controls with irrelevant/contradictory lessons. Repeat runs where models are stochastic. Prefer blind diff review with automated test results.

**Initial suite:** at least 30 varied tasks: 15 React Native repeat-correction cases, 5 version-change cases, 5 negative-scope/instruction-override cases, and 5 unrelated stack cases. Later expand to 100+ tasks and multiple agent/runtime versions.

**Metrics:** first-pass task success, repeat-correction count, regression rate, test pass rate, number of unrelated changed files, unsafe instruction application, precision/recall of lesson selection, human proposal acceptance, time overhead, context tokens, storage usage and redaction leakage tests.

**Proposed release gates (engineering targets, not measured results):**
- 100% of active lessons have stored explicit approval; 100% of global promotions separately approved.
- 0 leaked canary secrets in a published adversarial test corpus; 0 critical permission-boundary breaches in that corpus.
- >=98% correct suppressions on negative/out-of-scope retrieval fixtures; iterate toward >=99% before public beta.
- p95 local lookup overhead below 150 ms on the stated reference machine with 10,000 indexed lessons; cap prompt injection at 300 tokens in normal operation.
- No demonstrated material degradation on negative controls; target >=15% relative reduction in repeated developer corrections on the benchmark before claiming measurable effectiveness.
- Install, disable, crash and uninstall tests pass on latest supported macOS, Windows, Linux and target host/version matrix.
- Any critical privacy, prompt-injection or data-corruption failure blocks release regardless of aggregate score.

Thresholds are design targets to be tested and adjusted, **not promises** or existing performance measurements.

## 11. Release phases and deliverables

### Phase 0: Specification and baseline
- Freeze threat model, ADRs, lesson schema, runtime target, test fixtures and policy precedence.
- Import/inspect v0.1 and create failing tests for known weaknesses.
- Assemble first 10-20 real mobile developer corrections (reviewed and scrubbed).
- **Gate:** 30 baseline fixtures defined, metrics script producing reproducible JSON results.

### Phase 1: Reliable local core
- Build TypeScript packages: schema, storage/repository, deterministic policy, retrieval, CLI.
- SQLite transactional schema, migrations, audit history, full rollback, importer for v0.1 JSON.
- Implement project fingerprint/worktree identity, multi-project privacy partition, conflict/dedupe, rule version/expiry.
- Implement privacy-filtered capture, reviewed approval and typed data validation.
- **Gate:** unit+property+fuzz tests, parallel writers, crash recovery, backups, secret canaries, 3-OS CI.

### Phase 2: Portable skill and manual workflow
- Small spec-compliant SKILL.md; references for review and usage; CLI helper integration.
- CLI command to explain *why* rules were or were not retrieved.
- Default no active hook and no data collection until the user opts in.
- **Gate:** skill validation, at least three coding agents verified in manual invocation, no modifications to source repos.

### Phase 3: Opt-in learning adapters
- Implement Claude Code and Cursor first, with version-specific contract tests and no-op fallbacks.
- Add simple candidate detector for direct correction phrases and subsequent outcomes; human-reviewed proposals.
- Idempotency, exact uninstall and config backup.
- **Gate:** end-to-end fixture verification and host smoke tests on CLI and IDE; failures never stop primary tasks.

### Phase 4: Relevance and automated evidence
- Tune SQLite FTS5 and deterministic applicability predicates; avoid embedding/model infrastructure unless benchmarks demand it.
- Add observed tests/diffs metadata, revision conflicts and negative examples.
- Add opt-in model-assisted proposal generation with clear provider/data sharing notice and local fallback.
- **Gate:** measure ranking precision, side-effect rate, human acceptance and measured token/runtime cost.

### Phase 5: Cross-agent beta and open source hardening
- Codex, Copilot and Gemini adapters incrementally according to verified hook capabilities.
- CI matrix, lint/typechecks, dependency/license audits, adversarial security tests, build artifacts and provenance.
- Documentation: README, QUICKSTART, PRIVACY.md, SECURITY.md, THREAT_MODEL.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, LICENSE, CHANGELOG.md, COMPATIBILITY.md, ADRs, troubleshooting and uninstall.
- OpenSSF Scorecard, responsible disclosure, least-privilege GitHub Actions, SHA-pinned actions, npm trusted publishing if used.
- **Gate:** public beta security review and documented host compatibility matrix with tested versions.

### Phase 6: Evidence-backed improvements (after beta)
- Evaluate optional semantic search, developer-specific instruction hierarchies, multi-device exports, and narrow auto-promotion.
- Never silently auto-update core policy. Cross-project lessons remain review-gated.
- Expand evaluations to multiple languages, frameworks, agent models, and larger codebases.

Progress through these phases based on release gates and verified host behavior rather than a fixed calendar. Each phase should be demonstrably correct before enabling the next category of features.

## 12. Repository layout

```text
agent-lesson-lab/
  README.md
  LICENSE
  SECURITY.md
  PRIVACY.md
  CONTRIBUTING.md
  CODE_OF_CONDUCT.md
  CHANGELOG.md
  docs/
    architecture.md
    threat-model.md
    evaluation.md
    compatibility.md
    adr/
  skills/
    learn-from-corrections/
      SKILL.md
      references/
      scripts/
  packages/
    core/                 # Policies, applicability, schema
    store/                # SQLite, migrations, audit, search
    cli/                  # lessonlab commands
    host-contracts/       # Typed normalized lifecycle events
    adapter-claude/
    adapter-cursor/
    adapter-codex/        # later
    adapter-copilot/      # later
    adapter-gemini/       # later
  evals/
    fixtures/
    graders/
    reports/
  tests/
    unit/
    integration/
    security/
    concurrency/
    host-contract/
  .github/
    workflows/
    ISSUE_TEMPLATE/
    PULL_REQUEST_TEMPLATE.md
```

## 13. v0.1 review: required changes

The referenced v0.1 ZIP is unavailable in this workspace. Earlier claims about its size, contents, and test results cannot be verified here. The following were proposed gaps to check if that archive becomes available; they are not findings from the current repository:

1. **Proof-of-testing weakness:** `approve --test-result` takes any sufficiently long user-supplied string and cannot establish the stated test actually ran. Separate verified machine evidence from personal attestation.
2. **Too-simple project identity:** project scopes use caller-provided slugs, not canonical verified repository identities. A reused slug can cause unintended cross-project applicability.
3. **Naive ranking/overrides:** keyword intersection can return weak matches; category-based replacement can discard a valuable more-specific or more relevant rule even when it addresses a different condition.
4. **No concurrent-writer protection:** atomic rename prevents partially written files, but two simultaneous processes can read the same previous JSON and overwrite one another's new updates (lost update).
5. **Incomplete privacy filter:** regex handles a few common patterns, not all secrets and private code; storage isn't encrypted.
6. **Limited review:** there is no true structured test provenance, merge/split workflow, exclusion examples, fresh-version checks, or conflict graph.
7. **No hooks or direct host E2E verification yet:** the prototype demonstrates a CLI, not automatic learning across agents.
8. **Operational gaps:** no schema migration system, formal monitoring/diagnostics, uninstall tooling, installer idempotence or release security process.

Avoid patching all of these into one oversized CLI file. Extract a tested core with sharply defined interfaces.

## 14. First implementation backlog, in order

- **P0-01:** Create monorepo, CI, standard docs and ADRs; preserve existing prototype unchanged as a reference fixture.
- **P0-02:** Define JSON Schema/Zod-equivalent contract for lesson, evidence, scope, status, policy, host event.
- **P0-03:** Implement SQLite migrations, transactional writes, version history, and v0.1 importer.
- **P0-04:** Design repository identity and no-cross-project invariants.
- **P0-05:** Implement deterministic retrieval with `explain` output and negative rules.
- **P0-06:** Implement redaction/privacy allowlist and manual capture/review/approve; no automatic original transcript retention.
- **P0-07:** Add fuzz, concurrency, malicious-memory and crash-recovery tests.
- **P1-01:** Rewrite `SKILL.md` as thin portable interface; validate with official skill validator.
- **P1-02:** Add interactive/CLI review with exact revision diff and separate global promotion.
- **P1-03:** Add opt-in Claude Code adapter and contract tests.
- **P1-04:** Add opt-in Cursor adapter and contract tests.
- **P1-05:** Build repeatable React Native A/B evaluations and publish anonymized results.
- **P2:** Expand hosts, model-assisted extraction, semantic retrieval only after evidence.

**The first feature we must demonstrate:** a real correction in React Native project A becomes a reviewed lesson, helps a subsequent relevant task in project A (or another approved compatible project), is ignored for a conflicting redesign request, and can be disabled or rolled back without changing code or normal agent behavior.

## 15. Open-source trust checklist

- Document exact supported host/OS/Node versions; explicitly mark untested environments.
- Keep project source code unmodified by installer, capture, or retrieval services.
- Explicit opt-in for hooks, model providers, telemetry, syncing and repositories.
- No network access required for standard local usage; no hidden always-on background process.
- Protect user data with secure filesystem permissions, deletion/export options, retention defaults, and disclosure of limitations.
- Use clear `--dry-run`, `doctor`, `disable`, and clean `uninstall` tools.
- Use semver, changelog, signed/checksummed releases as feasible, and deterministic build inputs.
- Review dependency licenses, run code/secret/dependency scans, use minimal GitHub workflow permissions and pin third-party actions to immutable commit SHAs.
- Publish responsible-disclosure instructions; keep red-team test cases and regression checks maintained.
- Include reproducible performance methodology and **publish negative results** as well as improvements.

## 16. Sources for implementation review

- Agent Skills specification: https://agentskills.io/specification
- Claude Code hook development: https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md
- Cursor hooks: https://prod.cursor.com/docs/hooks
- Codex hooks: https://developers.openai.com/codex/hooks
- Gemini hook reference: https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
- Copilot customization: https://docs.github.com/en/copilot/reference/customization-cheat-sheet
- Agentic Context Engineering: https://arxiv.org/abs/2510.04618
- Claude-Mem: https://github.com/thedotmack/claude-mem
- OWASP LLM Top 10: https://genai.owasp.org/llm-top-10/
- OWASP AI Agent Security: https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html
- OpenAI on prompt injection: https://openai.com/index/designing-agents-to-resist-prompt-injection/
- Node built-in SQLite: https://nodejs.org/download/release/v24.20.0/docs/api/sqlite.html
- GitHub Actions secure use: https://docs.github.com/en/actions/reference/security/secure-use
- npm trusted publishing: https://docs.npmjs.com/trusted-publishers/
- OpenSSF Scorecard: https://openssf.org/projects/scorecard/
