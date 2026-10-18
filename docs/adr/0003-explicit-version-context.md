# ADR 0003: Explicit version context for bounded lessons

**Status:** Accepted locally on 2026-10-19.

## Context

A technical fact can become stale after a dependency or platform change. A task summary alone does not prove which version is installed. Reading manifests or lockfiles on every lookup would add I/O and could still select the wrong version for a workspace or target platform.

## Decision

Allow an approved lesson to specify one platform and one dependency with an inclusive minimum and/or exclusive upper version. Search and explain accept explicit task context. A bound lesson abstains when context is absent, mismatched, or uses a version the comparator cannot interpret. The comparator accepts only stable `MAJOR.MINOR.PATCH` triples and compares their numeric components. Prerelease/build metadata and other version schemes abstain. Unbounded existing schema-v2 lessons keep their hashes and behavior. Changing or removing bounds creates a proposed revision requiring review.

The limited comparator follows the stable numeric precedence defined by the [SemVer 2.0.0 specification](https://semver.org/). Full npm range semantics would need a dependency and would imply support for prerelease behavior this product has not tested. This narrow rule handles the demonstrated stale-advice case without claiming automatic environment detection.

## Consequences

The optional lookup hook supplies no verified dependency context, so it conservatively omits bounded lessons. Callers may pass version context for manual search. A wrong version supplied by a caller can still cause a wrong suggestion; the lesson remains advisory. Multiple dependencies, non-SemVer ecosystems, and semantic conflicts need separate evidence before expanding the model.
