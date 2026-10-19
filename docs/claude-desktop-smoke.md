# Claude Code Desktop smoke test

This is a manual host test, not a release qualification. The test uses two disposable Git repositories and one synthetic lesson store in an OS temporary directory. It does not change `~/.claude/settings.json` or add a lesson to the normal store. The skill project disables hooks so a user-level hook cannot supply its result. The hook project has a second probe that records only payload key names and value types, never prompt text or session IDs.

## Prepare

From this checkout, run `node evals/prepare-claude-desktop-smoke.ts`. Keep the printed paths and the two `expected...Title` values outside the prompts you send to Claude. The script creates `skillProject` and `hookProject`, each with a clean Git baseline. The local settings are under each project's `.claude/settings.local.json` and are ignored by Git.

The Claude Desktop **Code** tab must be available. Choose a **Local** session, not a cloud or SSH session, and select the printed project folder. The Chat tab does not exercise Claude Code project hooks. Use Manual permission mode and decline unrelated file edits or commands. The app's Code tab can use its own login even if `claude auth status` in a terminal reports an invalid CLI credential; [Claude's authentication reference](https://code.claude.com/docs/en/authentication) distinguishes Desktop OAuth from CLI environment credentials.

## Manual skill project

Open `skillProject` in a new local Code session. Invoke `/learn-from-corrections` from the slash-command menu. If it is absent, report that discovery failed and stop this part of the test. Send:

> Use this skill to look up approved lessons for “Fix login auth screen” in this project. The lessonlab CLI is at the printed `cli` path. Run only the lookup needed for this test; do not edit files. Tell me the exact title you found and the command you ran.

Replace “the printed `cli` path” in the prompt with the absolute `cli` value from setup. Compare the title with `expectedSkillTitle`. In a **new** session in the same project, invoke the skill again for “Redesign login auth screen” and ask for the `explain` reason. The approved lesson should be suppressed by its `redesign` exception. Do not include the expected title in either prompt.

## Automatic hook project

Open `hookProject` in a new local Code session. Do not invoke the skill. Send:

> For “Fix login auth screen,” did an advisory lesson appear in your context? If so, quote only its exact title. Do not read project files, run commands, or edit files.

The response should match `expectedHookTitle`. The hook's `additionalContext` is normally invisible as a chat message, so this unique title is the observable check. In a **new** session in the same project, ask the same question for “Redesign login auth screen”; no lesson title should appear.

The probe writes `hook-payload-shapes.jsonl` at the printed `probeLog` path. Its lines contain event name, sorted payload keys, `prompt` and `cwd` types, and prompt length only. Share those lines and the two responses, along with the Desktop app version (Claude → About Claude on macOS) and whether either project gained source-file changes. Do not share account data, tokens, full debug logs, or raw prompts beyond the two synthetic test prompts above.

After these first observations, the store can be disabled and the owned hook uninstalled for further smoke checks. Each requires a fresh Desktop session. Keep the fixture until those checks are finished, then remove the temporary root directory. A passing fixture or model response alone does not establish CLI or IDE compatibility; record the actual Desktop version and observed hook payload shape.

The setup follows the [Desktop local-session guidance](https://code.claude.com/docs/en/desktop), [project-local settings](https://code.claude.com/docs/en/settings), and [hook event contract](https://code.claude.com/docs/en/hooks).
