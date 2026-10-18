# Agent Lesson Lab

Agent Lesson Lab is a local CLI and portable Agent Skill for developer-reviewed coding lessons. A developer summarizes a correction, reviews a draft, and approves it before retrieval can suggest it in a matching Git repository. Lessons are advisory: the current user request and higher-priority instructions always control the task.

This is an **early local release**, not a measured improvement to coding agents. The included evaluation uses synthetic fixtures. No v0.1 archive or real reviewed corrections were available for compatibility or effectiveness testing.

## Requirements

- Node.js **24.15 or newer in the 24.x line** and Git. `node:sqlite` is a release-candidate API in this runtime.
- Local use requires no service, account, network, model provider, or package installation. Run `node /path/to/agent-lesson-loop/bin/lessonlab.ts` directly. `npm link` is optional.
- The project uses TypeScript source executed by Node 24. Run `npm ci` only to install developer tooling for `npm run check`.

The CLI and fixtures passed [three-OS hosted CI](https://github.com/hasebusman/agent-lesson-loop/actions/runs/39164292043) with Node 24.22.0. See [compatibility](COMPATIBILITY.md) for the limits of that result.

## Quick start

From a Git repository, run these commands with an absolute path to this checkout's CLI (or use `lessonlab` after `npm link`):

```sh
node /path/to/agent-lesson-loop/bin/lessonlab.ts init
node /path/to/agent-lesson-loop/bin/lessonlab.ts capture \
  --title "Preserve login screens during auth fixes" \
  --lesson "Change authentication logic without redesigning existing screens unless requested." \
  --when "auth,login" --except "redesign" \
  --verify "Inspect the login screen and run authentication tests"
node /path/to/agent-lesson-loop/bin/lessonlab.ts review <draft-id>
node /path/to/agent-lesson-loop/bin/lessonlab.ts approve <draft-id>
node /path/to/agent-lesson-loop/bin/lessonlab.ts search --task "Fix login auth"
node /path/to/agent-lesson-loop/bin/lessonlab.ts explain --task "Redesign login"
```

The CLI uses the current directory as its Git project by default. Pass `--project /path/to/repo` elsewhere. `--when` is a comma-separated list of triggering words or phrases; **at least one** must occur in the task summary. Optional `--requires` terms must **all** occur; use it to narrow a correction to a subtask, such as `--when auth --requires screen`. `--except` suppresses a lesson when a listed phrase occurs. Keep these conditions specific. `capture` stores your summary, never the original conversation. `approve` records human review, not proof that tests ran.

Version-specific advice can include `--platform ios --dependency firebase --min-version 10.0.0 --before-version 11.0.0` during capture. The lower bound is inclusive; the upper bound is exclusive. Search or explain with verified context such as `--platform ios --dependency firebase --dependency-version 10.4.0`. A bound lesson abstains when its platform, dependency, or version is missing or mismatched. The version comparator accepts stable `MAJOR.MINOR.PATCH` only; prerelease and other formats abstain. The CLI does not infer installed versions from a repository or task text. Existing unbounded lessons remain readable. A revision can replace the complete environment specification, or remove it with `--clear-environment`, and still needs review and approval.

After approval, `lessonlab attest <id> --result passed --note "I ran the login test"` stores a developer report with that label. `lessonlab run-check <id> -- npm test` executes the explicit command from the project root, without a shell, and records its exit result, command arguments, runtime/platform, timestamp, and output byte count. It does not preserve stdout, stderr, or environment variables. A nonzero exit is recorded as failed; a timeout, output limit, or launch error is unknown. The command can have its normal project side effects, so choose it as you would any other test command. Both evidence paths create immutable revisions. A later lesson-content edit leaves the old observation in history but does not present it as proof of the new content.

Retrieval favors project lessons over stack lessons, then global lessons when they have identical applicability terms. If multiple lessons at the same most-specific scope have identical terms and exceptions, retrieval abstains and `explain` reports the ambiguity. Retire or revise one of the overlaps before relying on it. Semantic contradictions with different terms still require human review.

## Review and control

```sh
lessonlab review                         # current project's lessons
lessonlab review <id> --diff             # changed content and scope in a pending draft
lessonlab history <id>                   # immutable revisions
lessonlab revise <id> --lesson "..."     # draft a replacement; old approval stays active
lessonlab reject <id>                    # reject a draft
lessonlab retire <id>                    # withdraw an active lesson
lessonlab rollback <id> --revision 2     # restore a previously approved revision
lessonlab disable                        # immediate retrieval kill switch
lessonlab enable
lessonlab doctor
```

Project lessons stay within one canonical Git repository; its worktrees share an identity. Stack and global scope require a separate promotion draft and an explicit `--promotion-approval` on approval. For example, `lessonlab promote <id> --scope stack --stack react-native`, then review the new revision and run `lessonlab approve <id> --promotion-approval`. Avoid global promotion unless the correction really applies everywhere.

`lessonlab backup` creates a private, consistent SQLite backup. `lessonlab export --output /private/path.json` writes the current project's revisions and audit history to a new file. `lessonlab delete <id> --yes` or `lessonlab delete --all --yes` permanently removes local records and local backups; external exports remain yours to remove. Use `--dry-run` to preview deletion. `lessonlab --help` lists all commands.

## Agent integration

- Copy [the portable skill](skills/learn-from-corrections/SKILL.md) into a host-supported skills directory, or point an agent to it. It provides manual lookup and drafting instructions.
- Claude Code has an **optional read-only lookup hook**. Run `lessonlab init` before installing it. Preview with `lessonlab integrate claude`, then install with `lessonlab integrate claude --yes`. The installer backs up existing settings and adds only its owned `UserPromptSubmit` entry. Preview removal with `lessonlab uninstall claude`; remove it with `lessonlab uninstall claude --yes`. Restart/reload Claude Code as needed. Run `lessonlab doctor --host claude` to inspect the local config. The hook does not capture prompts or lessons and does not create or migrate a store.
- Cursor and other agents use the portable skill/manual CLI for now. Their unattended context injection has not been qualified.

Installation does not enable automatic correction capture or change project source files. The hook silently emits no context on malformed input, disabled retrieval, or local errors.

## Data, evaluation, and development

The SQLite store defaults to the OS user-data directory, or `LESSONLAB_HOME` when set. On macOS this is `~/Library/Application Support/agent-lesson-lab`. It is **not encrypted**. The input filter rejects common secret patterns and personal email addresses but cannot detect every sensitive value. See [privacy](PRIVACY.md) and [security](SECURITY.md).

```sh
npm ci
npm test
npm run check
npm run eval
npm run eval:compare
npm run eval:scale
```

The evaluation scripts print reproducible **synthetic** retrieval and lookup reports; the checked-in reference outputs are in [evals/reports](evals/reports). Performance varies by machine. The [evaluation method](docs/evaluation.md) explains what these results establish. The [research comparison](docs/research-comparison.md) explains why the design combines reviewed incremental lessons with subtask context. The [architecture proposal](agent-learning-system-architecture-plan.md) and [implementation plan](IMPLEMENTATION_PLAN.md) preserve the design and its evidence limits.

Licensed under [Apache-2.0](LICENSE). See [contributing](CONTRIBUTING.md) before submitting changes.
