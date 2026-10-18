# ADR 0001: reviewed local lessons before automatic learning

Status: accepted for the local MVP, 2026-10-19.

## Context

The product should reuse direct developer corrections across coding tasks without allowing untrusted repository text or an assistant's own output to become standing instructions. The current evidence is a 30-case synthetic retrieval suite and local workflow tests. No real correction corpus or demonstrated reduction in repeat corrections exists.

## Decision

Store concise, project-scoped drafts in a local SQLite database. A developer must review and explicitly approve a revision before retrieval can show it. Broader-scope promotion needs a separate approval. Retrieve with deterministic scope, expiry, trigger, required-context, exception, and overlap checks; use FTS5 only to narrow candidates. Treat rendered lessons as advisory and let the current user request and host policy take precedence. Keep capture manual and hooks read-only until live host contracts and privacy behavior are verified.

## Alternatives considered

- **Automatic memory from transcripts:** could reduce manual effort, but would ingest more private content and make source authorization harder to prove. Revisit only with authenticated direct-user events, opt-in, minimization, idempotency, and human review.
- **Embeddings or model ranking:** may improve fuzzy recall, but add dependency, cost, data-flow, and explainability burdens. First measure missed relevant lessons on real cases against the deterministic baseline.
- **One shared global instruction file:** easy to implement, but cannot safely separate projects, expiry, exceptions, revisions, or conflicting current requests.

## Consequences and verification

The workflow asks a developer to draft and approve lessons; it will miss corrections the developer does not capture. That tradeoff is acceptable until data supports a safe automatic proposal path. The current [tests](../../tests/workflow.test.ts) cover approval, project isolation, exceptions, disable, rollback, and source-file non-modification. The [evaluation](../evaluation.md) is synthetic, so no coding-effectiveness claim follows from it. Revisit this ADR after the real A/B study and host smoke tests in the [roadmap](../../DEVELOPMENT_ROADMAP.md).
