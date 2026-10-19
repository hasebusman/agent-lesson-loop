# Troubleshooting

Use an absolute path to this checkout's `bin/lessonlab.ts`, or run `lessonlab` after `npm link`. Commands below assume the latter. Run `lessonlab --help` for the full option list.

| Symptom | Check and action |
|---|---|
| Node reports an unknown `.ts` extension or `node:sqlite` is unavailable | Run `node --version` in the **same terminal or agent host** that starts the CLI. Use Node 24.15+ within the 24.x line, then retry. The development dependencies are not required for normal CLI use. |
| Lookup says there is no safe local store | Run `lessonlab init` with the same `LESSONLAB_HOME` environment (or default user-data directory) used for lookup. Read-only commands deliberately do not create or migrate a store. Use `lessonlab doctor` to inspect an existing store. |
| A command says the project must be inside a Git repository | Run it from the intended Git repository or pass `--project /absolute/path/to/repo`. Worktrees share a project identity; independent clones have separate identities. |
| An approved lesson does not appear in `search` | Run `lessonlab explain --project /absolute/path/to/repo --task "the same task summary"`. Check disable state, project/scope, expiry, triggers, `--requires`, `--except`, version context, and ambiguity. `lessonlab review` shows current lesson status. An unapproved draft never appears. |
| A version-bound lesson is suppressed | Supply verified `--platform`, `--dependency`, and stable `--dependency-version MAJOR.MINOR.PATCH` as needed. Missing, mismatched, or prerelease versions abstain intentionally. The CLI does not inspect installed package versions for you. |
| Claude Code does not show advisory context | Run `lessonlab doctor --host claude`, confirm the store exists and retrieval is enabled, then preview `lessonlab integrate claude`. If the owned hook is installed, restart or reload the host. Hook fixture tests pass, but live CLI/IDE injection remains unqualified; consult [compatibility](../COMPATIBILITY.md) before relying on it. The hook silently emits no context on invalid input or local errors. |
| Capture rejects a field as private data | Rewrite the lesson as a short behavioral summary without credentials, personal identifiers, raw conversation, or source excerpts. The filter is heuristic; review every draft before approval. |

For recovery, `lessonlab backup` creates a consistent local SQLite backup. A schema-v1-to-v2 migration also creates a private pre-migration backup. Keep external copies where you control them. `lessonlab delete <id> --yes` and `lessonlab delete --all --yes` remove local backups as well as records; preview with `--dry-run` and read [privacy](../PRIVACY.md) before deletion. To report a suspected vulnerability, use [private vulnerability reporting](../SECURITY.md).
