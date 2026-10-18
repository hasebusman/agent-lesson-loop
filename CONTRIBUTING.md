# Contributing

This repository is an early local implementation. Start with the architecture proposal and implementation plan, then run `npm ci`, `npm test`, `npm run check`, and `npm run eval`. Node 24.15+ and Git are required. Include a focused test for changed safety, scope, migration, concurrency, or hook behavior. Keep synthetic results labeled; do not add real corrections, transcripts, credentials, or proprietary code to fixtures.

Changes to lesson data require a migration and a private backup path. Changes to host integration require current official contract documentation, payload fixtures, a fail-open path, and exact removal of owned settings. Do not enable automatic capture, global promotion, model calls or network sync by default. Open an issue for a material public API or data-boundary change before implementation.

By submitting a contribution, you license it under Apache-2.0 as described in [LICENSE](LICENSE). Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
