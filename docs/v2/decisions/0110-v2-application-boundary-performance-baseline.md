# ADR 0110: Harden the V2 command chooser and establish an application-boundary performance baseline

- Status: accepted
- Date: 2026-08-31
- Owners: Blast V2 application work

## Context

The V2 Electron client already consumes path-free command discovery and can
start, render, and stop one command. Its chooser currently depends on pointer
selection, and the repository has no recorded cold or warm latency baseline for
the real daemon/client path. Without those measurements, application polish
and extension-process latency can be conflated.

## Decision

Make the next application slice two small, observable improvements:

- extract the command chooser's filtering and selection rules into a pure
  renderer model;
- support ArrowUp/ArrowDown selection, wrapping at the list edges, Enter to run
  the selected command, selected-state semantics, and accessible listbox
  metadata; and
- add a repeatable V2 performance runner over the real `NodeCoreDaemon` and
  `CoreClientHost` boundary using the existing `e2e.scene` fixture.

The performance runner records monotonic samples for:

- daemon listener startup;
- client readiness, including local connection, handshake, and discovery;
- cold command start to the first scene;
- warm command start to the first scene after stopping and reusing the client;
- scene event round trip; and
- command stop.

Each metric stores raw samples and min, mean, median, p95, and max summaries.
The report records the runner version, Node/platform/architecture metadata, and
workload identity. It is a baseline, not a timing-based test gate: process
scheduling and host load may vary, while lifecycle and scene predicates remain
the success conditions.

## Boundary

The chooser remains renderer-owned and receives only `CoreCommandDescriptor`
metadata. The benchmark measures the client/core/extension boundary with a
portable fixture; it does not claim to measure Electron paint time, native
provider latency, or extension-owned dependency startup. No protocol message,
capability, or catalog trust rule changes in this slice.

## Consequences

- keyboard users can operate the command chooser without pointer selection;
- selection and filtering behavior can be tested without Electron or a browser;
- future performance changes have a committed ARM64 comparison point; and
- UI paint, daemon lifecycle, and extension execution remain separable metrics.

## Verification

- test filtering, empty results, selection clamping, and keyboard wrapping;
- run the performance runner against the real child-process fixture;
- record the ARM64 report under `docs/v2/performance/`;
- keep the V2, Electron, format, lint, and ARM64 package gates green.

## ARM64 baseline

The latest three-sample refresh after the daemon-owned catalog watcher in ADR
0116 ran on Linux ARM64 with Node 24.20.0, four available parallel workers,
and a Neoverse-N1 CPU. It is committed in
[`v2-arm64-baseline.json`](../performance/v2-arm64-baseline.json).

| Metric                      |     Median |        p95 |
| --------------------------- | ---------: | ---------: |
| daemon listener startup     |   1.341 ms |   4.041 ms |
| client readiness            |   6.532 ms |  12.705 ms |
| cold command to first scene | 104.077 ms | 107.453 ms |
| cold command stop           |  11.076 ms |  12.139 ms |
| warm discovery              |   4.155 ms |   4.162 ms |
| warm command to first scene | 104.010 ms | 106.121 ms |
| scene event round trip      |   2.606 ms |   3.855 ms |
| warm command stop           |  11.227 ms |  11.628 ms |

These numbers are comparison points rather than acceptance thresholds. The
warm command still launches a fresh extension process; it reuses the daemon,
socket, catalog index, and client host.
