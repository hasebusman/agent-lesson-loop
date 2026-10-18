# Compatibility

| Surface | Current state | Evidence |
|---|---|---|
| Node.js 24.15+ within 24.x | Required | Local Node 24.22.0 macOS run; built-in `node:sqlite` remains release candidate |
| macOS | Local CLI and fixture tests exercised | Automated local test suite |
| Linux | CI job configured; not yet observed | Hosted run required |
| Windows | CI job configured; not yet observed | Hosted run required |
| Agent Skills hosts | Portable `SKILL.md` for manual use | Format checked against current specification; no live host smoke test |
| Claude Code | Optional `UserPromptSubmit` read-only lookup | Payload/installer fixture tests; current hook docs checked; live CLI/IDE not verified |
| Cursor | Portable skill/manual CLI | No automatic context hook qualified |
| Codex, Copilot, Gemini CLI | Portable skill/manual CLI where skill loading is supported | No automatic adapter qualified |

The CLI requires a Git repository for project-scoped operations. Symlinks and worktrees are covered by local tests; independent clones intentionally have separate IDs. Monorepo packages share repository scope. The Node runtime, Git executable and filesystem permissions must be available to the host process. The Claude hook points to this checkout and Node executable, so moving or removing either breaks it safely; uninstall before moving the checkout.

Documentation checked on 2026-10-18: [Agent Skills specification](https://agentskills.io/specification), [Claude Code hooks](https://code.claude.com/docs/en/hooks), [Cursor hooks](https://cursor.com/docs/hooks), and [Node SQLite](https://nodejs.org/api/sqlite.html). These documents describe contracts, not proof that a particular host version ran this integration.
