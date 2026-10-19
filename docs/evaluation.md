# Evaluation

`npm run eval` creates two temporary Git repositories and a private temporary SQLite store. It approves 15 synthetic mobile lessons, adds five expired technical facts, then checks 30 tasks: 15 relevant mobile lookups, five expired-version suppressions, five explicit-exception suppressions, and five cross-project suppressions. It counts true/false positives and negatives, precision, recall, negative suppression, lookup time, and the largest rendered context. `npm run eval:scale` creates 10,000 synthetic indexed lessons and measures 50 in-process lookups plus 50 complete hook subprocess runs. Each run prints JSON; reference runs are under `evals/reports/`.

`npm run eval:compare` is a paired synthetic comparison of five broad-topic lessons. A variant with only `--when` and a variant with `--when` plus required screen context both face five screen tasks and five API tasks. It measures whether the extra condition suppresses same-topic, different-subtask suggestions. The [research comparison](research-comparison.md) explains why this condition was chosen.

The reference macOS Node 24.22.0 run selected all 15 expected lessons and suppressed all 15 negative cases. Its lookup p95 was about 0.11 ms for the small corpus and 0.095 ms for the original scale corpus. Those timings select lessons inside SQLite. The newer `hookProcessMs` measure includes Node startup, Git identity lookup, store opening, retrieval, rendering, and process exit. It still excludes live host scheduling and model response time, and it reports characters rather than tokenizer tokens. Results from one machine are not a promise for other hardware.

Four full-process observations are recorded in [the hook timing report](../evals/reports/hook-process-observations.md). Their p95 values range from 95.9 ms to 150.9 ms, leaving the 150 ms release target unverified.

The fixtures are deliberately synthetic. They establish deterministic retrieval behavior and negative scope checks, but they do not measure first-pass coding quality, correction reduction, human acceptance, live host support, or real secret-detection recall. A future effectiveness study needs consented, reviewed corrections, frozen starting commits, blind review, baseline/treatment tasks, negative controls and observed tests. No such real corpus was supplied, so no effectiveness claim is made.

The workflow suite also checks a declared conflict between lessons with different applicability conditions across all 64 combinations of their trigger, required, and exception terms. It compares indexed `search` with `explain`. This establishes the declared-conflict rule, not detection of contradictions in prose.

The [correction intake guide](correction-intake.md) describes the minimum information for one real example, optional reproducibility details, and separate permission for public fixtures. A single example can test the review workflow; it is not enough for an effectiveness claim.
