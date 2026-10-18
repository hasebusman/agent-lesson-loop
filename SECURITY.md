# Security

## Reporting

For a suspected vulnerability, do not open a public issue with a working exploit or secret. Use [private vulnerability reporting](https://github.com/hasebusman/agent-lesson-loop/security/advisories/new). There is no security SLA for this early release.

## Boundaries

Lessons are lower-trust advisory data. They do not grant tool access, change host policy, or override current user instructions. Capture requires a direct manual CLI action; approval and broader-scope promotion are separate actions. Project identity comes from the canonical Git common directory, so worktrees share lessons while independent clones do not. Scope, expiry, and exceptions are checked before rendering. Stored content is revalidated and hashed on read; invalid records are suppressed. Hashes detect accidental or unsophisticated tampering, not an attacker with write access to the database.

Capture writes only to the private data directory; lookup and review open the store read-only, and neither edits source repositories. `export` writes to an explicitly selected new output path; the Claude installer modifies the selected settings file only after `--yes`. The optional Claude hook emits advisory context only; input errors, database errors and disable state produce no context and a successful exit. Its settings installer previews by default, backs up existing JSON, and removes only its own hook entry. Review the preview before passing `--yes`.

The secret filter is heuristic. Do not enter passwords, tokens, personal identifiers, code excerpts or confidential details. The database and exports are plaintext. The current implementation has no data-at-rest encryption, sandbox, signed releases, external security audit, or verified live host matrix. Treat it as a local tool on a trusted machine.

Run `npm test`, `npm run check`, and the synthetic evaluation before a change. Dependency and host updates require renewed qualification. See [the threat model](docs/threat-model.md) for tested abuse cases and remaining risks.
