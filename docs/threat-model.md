# Threat model

The main assets are the private lesson store, developer intent, host configuration and source repository. Input can arrive from the developer's manual CLI fields, a task summary, an optional Claude hook payload, and the local database. A lesson is never treated as a policy or permission grant.

| Risk | Control and evidence | Residual limitation |
|---|---|---|
| Prompt injection in stored lessons | One-line structured fields, review before approval, revalidation on read, advisory rendering | A developer can still approve harmful advice; hash is not authenticated |
| Secret or personal data retention | Short summaries, common-pattern rejection across capture/evidence fields, canary tests, no chat or source capture | Unknown secret formats can pass; plaintext store |
| False test claims | Developer reports and actual CLI-run exit results have different evidence kinds; output is discarded; content edits retire current check claims | Local database writes are not authenticated; a process with database write access can forge records |
| Cross-project contamination | Canonical Git common-directory identity, scope gate before retrieval, project isolation tests | Monorepo packages share one identity; deliberate broad promotion crosses projects |
| Stale or conflicting advice | Expiry, explicit version/platform bounds with unknown-context abstention, exceptions, and conservative abstention for identical or incomparable required contexts at the same scope | Versions are caller-supplied stable triples; no automatic detection or semantic contradiction detector |
| Hook disruption | Read-only operation, bounded input, fail-open catch, disable switch, malformed-input test | Runtime startup and filesystem latency vary by host |
| Data corruption/lost writes | SQLite transactions, WAL, busy timeout, migrations, backups, concurrent writes, and process kills inside write and migration transactions | Disk failure and external backups are outside this program |
| Installer overwrites user config | Preview, config backup, owned-entry removal, idempotence test | Live host interpretation and concurrent external editors need care |
| Supply chain | Two development dependencies, lockfile, SHA-pinned CI actions, [point-in-time dependency review](dependency-review.md) | No published artifact provenance or external audit yet |

No automatic observation, model extraction, telemetry or network synchronization is implemented. Checks run only through an explicit CLI command. The v0.1 archive is absent, so its importer contract cannot be verified. The synthetic suite must not be used to certify production security or effectiveness.
