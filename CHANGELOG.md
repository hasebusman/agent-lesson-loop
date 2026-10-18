# Changelog

## Unreleased

- Kept explicitly remembered project choices within their repository and added a two-repository regression test.
- Distinguished human review, developer-reported outcomes, and explicitly observed command checks. Check output is discarded; failures and unknown results remain visible.
- Added pending-revision field diffs and explicit platform/dependency version bounds with unknown-context abstention.
- Added concurrent revision, backup restoration, and output-canary regression checks.
- Published the Apache-2.0 source repository, passed hosted CI on three operating systems, and enabled private vulnerability reporting and dependency update checks.
- Expanded synthetic privacy canaries to the GitHub OAuth and service token families.
- Opened lookup and review commands through the read-only store path after an isolated Codex CLI smoke run exposed a sandbox permission failure.

## 0.1.0 — 2026-10-18

- Added local SQLite lesson lifecycle, immutable revisions, approval, scope-gated retrieval, rollback, export, deletion and disable.
- Added portable Agent Skill and optional Claude Code read-only lookup hook with reversible installer.
- Added synthetic retrieval and 10,000-lesson lookup evaluations, safety tests, documentation and CI configuration.
- Added optional all-required subtask context, conservative specificity precedence, and a paired synthetic retrieval comparison; existing schema-v2 hashes remain readable.
- Initial release remains unverified on live hosts beyond local macOS fixture testing.
