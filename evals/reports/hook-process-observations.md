# Full hook subprocess observations

2026-10-19, macOS arm64, Node 24.22.0. `npm run eval:scale` populated 10,000 synthetic approved lessons and ran 50 complete `UserPromptSubmit` hook subprocesses per invocation. Timing includes Node startup, Git project identity, read-only store open, selection, rendering, and process exit. The script checks that each subprocess returns its expected synthetic lesson. Neither invocation used a live agent host.

| Invocation | In-process lookup p95 | Complete hook p50 | Complete hook p95 | Largest context |
|---|---:|---:|---:|---:|
| 1 | 0.127 ms | 100.9 ms | 150.9 ms | 318 characters |
| 2 | 0.156 ms | 91.7 ms | 98.6 ms | 318 characters |

The two p95 values differ enough that this machine does not yet establish a stable sub-150 ms end-to-end gate. The first crosses that target slightly; the second passes. These are local wall-clock measurements subject to process scheduling. Before claiming a release target, rerun on a stated reference machine under controlled load, include host scheduling, and measure tokens with the target host tokenizer. Do not use the earlier in-process SQLite figure as a proxy for user-visible hook overhead.
