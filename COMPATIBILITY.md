# Compatibility

| Surface | Current state | Evidence |
|---|---|---|
| Node.js 24.15+ within 24.x | Required | Local Node 24.22.0 macOS run; built-in `node:sqlite` remains release candidate |
| macOS | Local CLI and hosted CI exercised | [Three-OS CI run](https://github.com/hasebusman/agent-lesson-loop/actions/runs/39165016739) |
| Linux (Ubuntu 24.04) | Hosted CI exercised | Same run, `ubuntu-24.04` job |
| Windows | Hosted CI exercised | Same run, `windows-latest` job |
| Agent Skills hosts | Portable `SKILL.md` for manual use | Format checked against current specification; one explicit Codex CLI smoke run, no automatic-discovery result |
| Claude Code | Optional `UserPromptSubmit` read-only lookup | Payload/installer fixture tests; current hook docs checked. Installed CLI 1.0.90 rejected an isolated smoke test before a model request with `Invalid API key`; live CLI/IDE behavior remains unverified |
| Cursor | Portable skill/manual CLI | No automatic context hook qualified |
| Codex CLI 0.145.0 | Portable skill/manual CLI | Isolated read-only sandbox run selected and suppressed the expected synthetic lesson; source files stayed unchanged |
| Copilot, Gemini CLI | Portable skill/manual CLI where skill loading is supported | No live host smoke test or automatic adapter qualified |

The CLI requires a Git repository for project-scoped operations. Symlinks and worktrees are covered by local tests; independent clones intentionally have separate IDs. Monorepo packages share repository scope. The Node runtime, Git executable and filesystem permissions must be available to the host process. The Claude hook points to this checkout and Node executable, so moving or removing either breaks it safely; uninstall before moving the checkout.

The three jobs passed on commit `4936cda535df712672451bb0cf9e85438e0899da` with Node 24.22.0. They run type checking, the 32-test suite, and both synthetic evaluations. Hosted CI verifies the CLI and fixtures on these runners; it does not establish agent-host compatibility.

On 2026-10-19, an explicit Codex CLI 0.145.0 run in a temporary Git repository and read-only sandbox invoked `search` and `explain` for synthetic login tasks. It selected the approved lesson for an auth fix, suppressed it for a redesign, and left source files unchanged. The first attempt exposed write-capable store setup in CLI lookup commands; the current code routes them through the read-only opener. This single run does not establish automatic skill discovery or coding benefit.

Documentation checked on 2026-10-18: [Agent Skills specification](https://agentskills.io/specification), [Claude Code hooks](https://code.claude.com/docs/en/hooks), [Cursor hooks](https://cursor.com/docs/hooks), and [Node SQLite](https://nodejs.org/api/sqlite.html). These documents describe contracts, not proof that a particular host version ran this integration.
