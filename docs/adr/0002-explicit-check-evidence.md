# ADR 0002: Explicit check evidence without output retention

**Status:** Accepted locally on 2026-10-19; host behavior remains unqualified.

## Context

An approved lesson has human-review evidence, but a developer's statement that a test passed is not a process result. Recording arbitrary test output would create a new path for secrets and source excerpts to enter the private store. Existing lessons already have immutable JSON revisions in SQLite schema v2.

## Decision

Keep three distinct evidence kinds: human review, developer-reported outcome, and a command result observed by `run-check`. The latter runs only when explicitly invoked, from the selected Git project, with argument-array process execution (`shell: false`), a timeout, and an output limit. It records the command, runtime/platform summary, timestamp, exit status, and output byte count. It discards stdout and stderr. A timeout, launch error, signal, or output-limit failure is `unknown`, not `failed` or `passed`. Evidence is appended as a new immutable revision; when lesson content changes, its old check remains in history but is not current proof.

Use the existing revision format rather than adding a separate evidence table or migrating the database. Backups and rollback remain available. A schema migration would add risk without improving this boundary.

## Alternatives and limits

- A free-text `--test-result` field is cheaper but cannot distinguish a claim from an observed exit.
- Retaining redacted output would improve audit detail, but arbitrary tool output cannot be scrubbed reliably. The CLI keeps no output artifact.
- A separate evidence table would avoid evidence-only lesson revisions, but would split the review view across two stores and require migration now.

The observed exit does not prove that the command was relevant to the lesson or that the lesson improved an agent's work. The environment summary excludes environment-variable values. Someone with write access to the local database can forge records; this is not cryptographic attestation. The caller must choose an independently authorized command, because it can have normal project side effects.

The process controls follow the [Node.js 24 child-process documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/child_process.html). Local proof is in the workflow tests for reported versus observed outcomes, failure and unknown labels, output non-retention, and revision applicability.
