# Compatibility

| Surface | Current state | Evidence |
|---|---|---|
| Node.js 24.15+ within 24.x | Required | Local Node 24.22.0 macOS run; built-in `node:sqlite` remains release candidate |
| macOS | Local CLI and hosted CI exercised | [Three-OS CI run](https://github.com/hasebusman/agent-lesson-loop/actions/runs/39202048710) |
| Linux (Ubuntu 24.04) | Hosted CI exercised | Same run, `ubuntu-24.04` job |
| Windows | Hosted CI exercised | Same run, `windows-latest` job |
| Agent Skills hosts | Portable `SKILL.md` for manual use | Format checked against current specification; explicit Codex and Copilot CLI smoke runs, with project-skill discovery in Copilot after explicit invocation |
| Claude Code | Optional `UserPromptSubmit` read-only lookup | Payload/installer fixture tests; [current hook docs](https://code.claude.com/docs/en/hooks) checked. Installed CLI 1.0.90 reports `Invalid API key` before a model request; live CLI/IDE behavior remains unverified |
| Cursor | Portable skill/manual CLI | No automatic context hook qualified |
| Codex CLI 0.145.0 | Portable skill/manual CLI | Isolated read-only sandbox run explicitly read the project skill, then selected and suppressed the expected synthetic lesson; source files stayed unchanged |
| Copilot CLI 1.0.77 | Portable skill/manual CLI | Isolated run discovered and loaded the project skill after explicit invocation, ran `search`/`explain`, selected and suppressed the expected synthetic lesson, and made no repository edits |
| Gemini CLI 0.1.5 | Unqualified for the portable skill | An earlier isolated attempt stopped at Google sign-in; a new harmless prompt timed out without a response. This installed version did not expose the current `gemini skills` command. [Current Gemini CLI skills docs](https://geminicli.com/docs/cli/skills/) describe workspace discovery and activation, but do not qualify this older binary. |

The CLI requires a Git repository for project-scoped operations. Symlinks and worktrees are covered by local tests; independent clones intentionally have separate IDs. Monorepo packages share repository scope. The Node runtime, Git executable and filesystem permissions must be available to the host process. The Claude hook points to this checkout and Node executable, so moving or removing either breaks it safely; uninstall before moving the checkout.

The three jobs passed on commit `a6d1723` with Node 24.22.0. They ran type checking, the 35-test suite, and both synthetic evaluations. Hosted CI verifies the CLI and fixtures on these runners; it does not establish agent-host compatibility.

On 2026-10-19, an explicit Codex CLI 0.145.0 run in a temporary Git repository and read-only sandbox read the project's skill file, then invoked `search` and `explain` for synthetic login tasks. All four lookup commands exited successfully. It selected the approved lesson for an auth fix, suppressed it for a redesign, and left source files unchanged. An earlier CLI-only attempt exposed write-capable store setup in lookup commands; the current code routes them through the read-only opener. These runs do not establish unprompted skill selection or coding benefit.

An isolated Copilot CLI 1.0.77 run on the same date discovered the project skill, loaded it when explicitly named, and invoked `search` and `explain` for both synthetic tasks. Its trace selected “Preserve sign-in screen” for “Fix auth login” and suppressed it for “Redesign login auth” because the `redesign` exception matched. The temporary repository showed no edits after the run. This does not establish unprompted skill selection or coding benefit. Gemini CLI 0.1.5 has not completed a model request in the isolated smoke environment, so it provides no skill-behavior evidence. Claude Code CLI 1.0.90 still reports an invalid API key; fixture-level hook behavior cannot substitute for a live host run.

Documentation checked on 2026-10-18–19: [Agent Skills specification](https://agentskills.io/specification), [Claude Code hooks](https://code.claude.com/docs/en/hooks), [Gemini CLI skills](https://geminicli.com/docs/cli/skills/), [Cursor hooks](https://cursor.com/docs/hooks), and [Node SQLite](https://nodejs.org/api/sqlite.html). These documents describe contracts, not proof that a particular host version ran this integration.
