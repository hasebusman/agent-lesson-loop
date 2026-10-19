# Full hook subprocess observations

2026-10-19, macOS arm64, Node 24.22.0. `npm run eval:scale` populated 10,000 synthetic approved lessons and ran 50 complete `UserPromptSubmit` hook subprocesses per invocation. Timing includes Node startup, Git project identity, read-only store open, selection, rendering, and process exit. The script checks that each subprocess returns its expected synthetic lesson. No invocation used a live agent host. Invocation 3 includes the retrieval change that searches the FTS trigger column with all bounded task terms.

| Invocation | In-process lookup p95 | Complete hook p50 | Complete hook p95 | Largest context |
|---|---:|---:|---:|---:|
| 1 | 0.127 ms | 100.9 ms | 150.9 ms | 318 characters |
| 2 | 0.156 ms | 91.7 ms | 98.6 ms | 318 characters |
| 3 | 0.100 ms | 91.4 ms | 95.9 ms | 318 characters |
| 4, declared-conflict revision | 0.104 ms | 96.9 ms | 107.5 ms | 318 characters |

The first p95 crosses the sub-150 ms target slightly; the other two pass. These local wall-clock measurements are subject to process scheduling and do not establish the end-to-end release gate. Before claiming that target, rerun on a stated reference machine under controlled load, include host scheduling, and measure tokens with the target host tokenizer. Do not use the earlier in-process SQLite figure as a proxy for user-visible hook overhead.
