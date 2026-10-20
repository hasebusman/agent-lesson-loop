# Codex CLI implicit-skill smoke, 2026-10-20

Codex CLI 0.145.0 ran in a disposable Git repository on macOS with a project-local copy of `learn-from-corrections`, Node 24.22.0, and a separate private store containing one approved **synthetic** login lesson. Runs used `codex exec --json --ephemeral --ignore-user-config`. No raw recent-chat content, credentials, or app source files were placed in this report or the public repository.

The cases follow the [OpenAI Docs skill-eval pattern](https://developers.openai.com/blog/eval-skills): inspect the trace for skill selection and commands, include an implicit positive case and a negative control, and check side effects.

| Case | Observed trace | Result |
|---|---|---|
| Implicit lookup without naming the skill | Codex read the project skill, ran `lessonlab search` for a login repair, and ran `lessonlab explain` for a redesign. It reported the approved synthetic title and the matching `redesign` exception. | Pass for this Codex CLI version and fixture. |
| Unrelated iOS build-error request, abstracted from a recent chat | Codex did not read the skill or call `lessonlab`; it answered the build question. | Pass as a negative control. |
| Review of an abstracted older mobile-app chat containing a build error, one project-local naming constraint, and a release-review request | Codex read the skill, classified these as task context rather than an explicit request to remember a correction, and made no capture call. | Pass for classification and no persistence. |

The fixture repository had no tracked-file changes, and the synthetic store still contained only its prepared approved lesson. Two untracked setup directories held the copied skill and a local CLI launcher. A further case based on a scrubbed direct UI correction reached `429 Too Many Requests` before a model response; it has no behavioral result.

An initial run in Codex's `read-only` sandbox selected the skill but SQLite returned `unable to open database file` for the private store outside the workspace. The successful runs used `workspace-write` with the **disposable** store directory added as a writable directory. This is an observed setup constraint, not proof that every Codex sandbox or user-data location behaves the same way. The CLI's `search` and `explain` still opened the store in read-only mode.

These runs establish one positive implicit selection and two safe negative/contextual behaviors in Codex CLI. They do not qualify a third host, Codex Desktop skill discovery, live Claude behavior, or a coding-outcome A/B study. A possible direct correction was identified in a recent chat, but it was not copied to the repository, captured, approved, or used as a consented study example.
