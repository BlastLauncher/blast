# Performance baseline

Run `bun run bench` (or `bun run bench --samples 3` for a quick check) to print
all four measurement groups and save raw JSON under `.cache/bench/` (gitignored).
Timing is machine-dependent, so the benchmark stays outside `bun run verify` and
`bun test`. It uses the OpenTUI test renderer and throwaway temp directories: no
real terminal, clipboard, app, window, or network is touched.

## What each group measures

1. **Host launch (`fixtures/extensions/hello-list` → first scene)** — `cold`
   uses an empty `dataDir` (bundle + compile cache + fresh Node); `cached` reuses
   bundle and compile caches with a fresh engine (no standby child); `warm`
   claims a pre-warmed standby runtime from `RuntimePool`.
2. **Runtime → host wire bytes** — NDJSON line size for one update of a synthetic
   `List` (1,000 or 10,000 `List.Item`s with actions): full `scene` vs
   `scene.patch` on a one-item prop edit and a controlled search filter (`"42"`).
3. **`blast serve` embedder wire bytes** — NDJSON line size sent to an embedder
   for the same updates plus an arrow-down selection move: whole `session.view`
   vs protocol 2 `session.view.patch` (plus opt-in `session.scene` when
   `hello.scenes: true`, off by default; decision 0020).
4. **TUI (`scripts/tui-benchmark.ts`)** — fresh `--popup` process start to root
   and `hello-list` first frame (cold vs warm `dataDir`), direct `hello-list`
   first frame, and 10,000-item arrow-down keystroke latency (20 steps).

## Recorded baseline

Environment: `darwin/arm64` (Darwin 27.0.0), Apple M3 (8 cores), Node `v24.20.0`,
Bun `1.4.4`, `samples=5` (20 keystrokes for TUI key latency).

| Group             | Measurement                                                                   | Result (median / p95, or bytes)                     |
| ----------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| 1. Host launch    | `hello-list` cold (empty dataDir, no pool)                                    | 145 ms / 238 ms                                     |
| 1. Host launch    | `hello-list` cached (no standby child)                                        | 77.0 ms / 109 ms                                    |
| 1. Host launch    | `hello-list` warm (pool primed)                                               | 7.46 ms / 12.9 ms                                   |
| 2. Runtime → host | 1,000 items, one-item prop edit (`scene` → `scene.patch`)                     | 369.1 KiB → 193 B (-99.9%)                          |
| 2. Runtime → host | 1,000 items, search filter, 20 hits (`scene` → `scene.patch`)                 | 7.7 KiB → 331 B (-95.8%)                            |
| 2. Runtime → host | 10,000 items, one-item prop edit (`scene` → `scene.patch`)                    | 3.66 MiB → 193 B (-99.99%)                          |
| 2. Runtime → host | 10,000 items, search filter, 299 hits (`scene` → `scene.patch`)               | 112.4 KiB → 2.5 KiB (-97.8%)                        |
| 3. `blast serve`  | 1,000 items, one-item prop edit (`session.view` → `session.view.patch`)       | 187.9 KiB → 364 B (-99.8%; opt-in scene 369.2 KiB)  |
| 3. `blast serve`  | 1,000 items, selection move down (`session.view` → `session.view.patch`)      | 187.9 KiB → 723 B (-99.6%)                          |
| 3. `blast serve`  | 1,000 items, search filter, 20 hits (`session.view` → `session.view.patch`)   | 4.4 KiB → 4.1 KiB (-6.9%; opt-in scene 7.7 KiB)     |
| 3. `blast serve`  | 10,000 items, one-item prop edit (`session.view` → `session.view.patch`)      | 1.86 MiB → 364 B (-99.99%; opt-in scene 3.66 MiB)   |
| 3. `blast serve`  | 10,000 items, selection move down (`session.view` → `session.view.patch`)     | 1.86 MiB → 723 B (-99.99%)                          |
| 3. `blast serve`  | 10,000 items, search filter, 299 hits (`session.view` → `session.view.patch`) | 57.5 KiB → 57.2 KiB (-0.5%; opt-in scene 112.5 KiB) |
| 4. TUI            | popup cold → root / `hello-list`                                              | 90.3 ms (p95 96.2) / 240 ms (p95 243)               |
| 4. TUI            | popup warm → root / `hello-list`                                              | 93.8 ms (p95 127) / 190 ms (p95 221)                |
| 4. TUI            | direct `hello-list` first frame                                               | 120 ms / 140 ms                                     |
| 4. TUI            | 10,000-item keystroke latency (20 steps)                                      | 1.91 ms / 5.00 ms                                   |

Embedder protocol 2 (decision 0020) shrinks a 10,000-item one-item edit on the
`blast serve` wire from 5.52 MiB (`session.view` + `session.scene`) to 364 B
(`session.view.patch` only), and an arrow-down selection move from 1.86 MiB to
723 B.
