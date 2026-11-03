---
id: "0094"
title: Run the full corpus sweep and triage its failures
status: doing
milestone: M6
depends: ["0091", "0092"]
---

## Goal

`compat/SWEEP.md` reports the whole satisfied population (1,939 extensions)
with the primary action probe, and the top failure causes are traced to a root
cause, so the orchestrator can write fix tasks.

## Context

The 100-extension pilot projects about 30 minutes and a 450 MB `.cache` peak
for the full run. Run
`bun run corpus:sweep --seed 0091 --jobs 4 --probe-actions` with no `--limit`.
Use `--resume` if it is interrupted; the log in `.cache/sweep/results.jsonl`
makes that safe.

In the pilot, 7 of 10 crashes were "Cannot convert undefined or null to
object", and they only appeared once the probe waited for loading to finish.
That looks like a Blast API returning `undefined` where Raycast returns an
object. Find which API.

Triage means reading code, not fixing it: for each cause, decide whether it is
a Blast bug (name the API and file), an extension bug, an expected consequence
of the headless broker or sandbox (no network, denied capabilities, no shell),
or a dependency mismatch (0093 rules).

## Acceptance

- [ ] Full run committed: `compat/SWEEP.md` and `compat/sweep.json`, within
      their size limits and with 0091 redaction.
- [ ] Handoff gives outcome totals, both crash rates with denominators, wall
      time and peak `.cache`.
- [ ] Handoff has a table of the top 10 failure causes by commands affected,
      each with its category, evidence (file:line in Blast, or the extension
      and its source line) and a one-line proposed fix or "expected".
- [ ] The "Cannot convert undefined or null to object" crash is traced to the
      Blast API and the Raycast behaviour it should match.
- [ ] `.cache` is left under 150 MB. `bun run verify` passes.

## Out of scope

- Fixing anything the sweep finds; changing the sandbox, broker or selection.
- Installing extension dependencies or running with network access.

## Handoff

The triage table below counts command records, so overlapping signatures (for
example the two commands importing both swift: and rust:) appear in each
relevant row.

|                                                               Commands | Category                                                                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                           | Proposed fix / expected                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------: | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 291 (storage.get 266, storage.all 13, storage.set 8, storage.remove 4) | Sweep-tool policy gap; currently an expected headless consequence           | The sweep starts createBroker(createHeadlessHandlers()) and no storage handlers at scripts/corpus/smoke-command.ts:369-380; normal embedders compose createSessionBroker with createStorageHandlers at packages/host/src/client.ts:6-16, and the handlers exist at packages/host/src/storage.ts:170-195.                                                                                                                                           | Give each sweep command an isolated in-memory storage handler (matching the default embedder contract), or report this policy explicitly as denied; do not persist sweep data.                                                                                  |
|                                                         117 (open.url) | Expected headless consequence                                               | packages/runtime/src/api/open.ts:47-55 requests the side-effect capability; the sweep has no open handler (scripts/corpus/smoke-command.ts:369-380).                                                                                                                                                                                                                                                                                               | Expected: keep URL opens denied in a no-desktop sweep; a client may record URLs or grant it.                                                                                                                                                                    |
|                                                  15 (oauth.tokens.get) | Sweep-tool policy gap; expected empty headless state once fixed             | Raycast token reads map an empty store to undefined at packages/runtime/src/api/oauth.ts:173-176; the normal host installs persistent OAuth handlers (packages/host/src/client.ts:12-16), while the sweep broker omits them.                                                                                                                                                                                                                       | Add an isolated empty/in-memory OAuth handler to the sweep, or label denial as an intentional no-credentials policy.                                                                                                                                            |
|                                              85 async Client Component | Blast bug (React reconciler / Suspense path)                                | meeting-room-check/src/list-rooms.tsx:387-411 uses withAccessToken around a view component. The upstream wrapper calls React.use(authorize()) in its component (@raycast/utils src/oauth/withAccessToken.tsx:125-135); the Blast root only mounts with updateContainerSync/flushSyncWork and has no Suspense boundary (packages/runtime/src/reconciler/index.ts:199-220).                                                                          | Support thrown thenables/Suspense or implement the auth wrapper without React use(); Raycast supports this view HOC, while async no-view command functions are the supported async entrypoint.                                                                  |
|                                                          82 (swift:..) | Expected platform/native consequence, with a selection/reporting gap        | battery-drain/src/collectors/smc-native.ts:1-3 imports swift:; Raycast's build compiles and binds extension Swift. The selector only excludes swift: (scripts/corpus/selection.ts:55-58), and the bundle plugin records the special specifier as a missing package (packages/host/src/bundle.ts:255-291).                                                                                                                                          | Exclude both swift: and rust: candidates before the sweep, and report native-module/unsupported native interop rather than npm missing-dependency.                                                                                                              |
|                                                           33 (rust:..) | Expected platform/native consequence, with the same selection/reporting gap | brightness-control/src/utils/brightness-native.ts:1-18 imports rust: and documents generated Rust bindings; ruler/src/ruler.ts:11-17 dynamically imports both native bridges.                                                                                                                                                                                                                                                                      | Same as Swift: no native compiler/bridge in platform-free Blast; classify as native-module and leave the extension source unchanged.                                                                                                                            |
|                        57 (spawn EPERM 47, spawnSync /bin/sh EPERM 10) | Expected sandbox consequence; render classification already correct         | scripts/corpus/smoke.ts:432-434,535-550 maps EPERM/not-permitted errors to sandbox-denied; the report has 59 sandbox-denied outcomes. The remaining primary-action EPERM is an action error, not a render outcome.                                                                                                                                                                                                                                 | Keep render results as sandbox-denied; optionally classify action EPERM with the same category in a future sweep-tool change and add a focused test.                                                                                                            |
|                                                       23 (Invalid URL) | Extension bug / placeholder-input consequence                               | directadmin-reseller/src/utils/constants.ts:3-8 constructs new URL(DIRECTADMIN_URL) at module load, before its component's isInvalidUrl guard (src/databases.tsx:5-7); the sweep supplies deterministic placeholder preferences.                                                                                                                                                                                                                   | Validate preferences before constructing URLs, or mark invalid placeholder-preference launches separately.                                                                                                                                                      |
|                                                14 (@/lib 9, @/hooks 5) | Blast bundler bug                                                           | Sonarr imports @/lib/... at src/index.tsx:15-32; its JSONC tsconfig.json has trailing commas. packages/host/src/tsconfig-paths.ts:80-85 uses strict JSON.parse, disables aliases on that valid JSONC, and bundle.ts:221-230 then reports the aliases as missing packages.                                                                                                                                                                          | Parse JSONC (comments/trailing commas) for tsconfig aliases and add regression fixtures.                                                                                                                                                                        |
|                                                    14 (ws 9, undici 5) | Dependency mismatch                                                         | microsoft-teams-calling/src/teams/meetingClient.ts:1 imports ws; agent-usage/src/agents/http.ts:1-9 dynamically imports undici. Neither is in the shared allowlist, and bundle.ts:255-291 correctly reports unprovided packages under the 0093 policy.                                                                                                                                                                                             | Install/declare extension dependencies through the dependency layer, or add a deliberately pinned shared package after compatibility review; do not silently use host transitive copies.                                                                        |
|                         7 (Cannot convert undefined or null to object) | Extension/offline-response bug; suspected Blast API mismatch not reproduced | All seven are Zipcodebase commands. They call Object.keys(response.results) after a results-in-response check (zipcodebase/src/get-postal-code-distance.tsx:15-19); utils/api.ts:16-47 returns an error object or unvalidated JSON when the offline request fails. Blast showToast returns a Toast (packages/runtime/src/api/feedback.ts:160-168), matching Raycast's documented Promise<Toast>, so no undefined-returning Blast API is evidenced. | Validate the response shape and render an error/empty state when results is absent; preserve the raw log for a follow-up with a stack trace if a Blast API regression is suspected.                                                                             |
|                6 (Cannot read properties of undefined, reading length) | Extension bug plus sandbox consequence                                      | Airport dereferences state.all.length after a failed fetch leaves arrays undefined (airport/src/index.tsx:82-87,138-147); Microsoft Edge conditionally calls hooks from profiles?.map (microsoft-edge/src/new-tab.tsx:24-29), causing hook-order fallout; Node Version Manager assumes spawnSync streams exist (node-version-manager/src/utils/managers/nvm.ts:6-10,35-40) after sandbox EPERM.                                                    | Guard failed responses and keep hook order unconditional; classify the NVM case as sandbox-denied.                                                                                                                                                              |
|                                             3 (@raycast/utils bundles) | Dependency mismatch                                                         | Comet imports @raycast/utils from src/hooks/useHistorySearch.tsx:5; its manifest declares ^1.18.1 while the shared fallback is 2.3.2 (comet/package.json:268-272), so the major-aware resolver refuses it.                                                                                                                                                                                                                                         | Install the extension's declared v1 dependency or add a compatible shared v1 layer; do not relax the major-version rule.                                                                                                                                        |
|                  3 primary-action crashes; 220 primary-action timeouts | Probe classification/coverage limitation, with genuine offline work         | Crashes are geoping/ping (spawn EPERM), scrapbox-search/index (network ENOTFOUND), and delphi-tools-raycast-extension/barcode (spawn delphitools ENOENT). Every timeout is dispatched and settles at about 1000 ms, exactly ACTION_TIMEOUT_MS (scripts/corpus/smoke-command.ts:36-43,236-243), with no scene/exit observed.                                                                                                                        | Keep the 1 s timeout as a bounded probe; report action timeouts separately from render failures and classify the three crashes by sandbox/network/extension cause. A future probe could observe capability/network rejection or use a longer diagnostic window. |

The report itself records a resumed run (5,443 resumed commands). Its wall
time, throughput, peak and projected-full-population lines are not whole-run
measurements. The generator should emit an explicit resumed-run warning and
omit timing/projection fields unless the log started clean (or aggregate
per-batch timings). compat/SWEEP.md currently carries the warning manually;
the next sweep-tool change should make it conditional in renderSweepMarkdown.

Branch/commit: t3-13fdfcab @ dd2d896
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 50.1s
Done:

- Merged t3/full-corpus-sweep-triage; the committed report covers 1,939 extensions and 5,759 commands.
- Report totals: 4,879 rendered, 27 completed, 451 capability-denied, 59 sandbox-denied, 170 bundle-failed, 157 crashed, 14 network, 2 unsupported-api. Render crash rate is 157/5,759 (2.7%); dispatched primary-action crash rate is 3/1,358 (0.2%).
- The run was resumed for 5,443 commands. Its 227 s wall time, 1,523.17 commands/min, 1,498.6 MB peak and projected-full-population values are not meaningful as whole-run measurements; the report should label resumed-run timing/projection as partial/invalid and compute metrics only from a fresh run (or record per-batch timings).
- The detailed cause table and proposed fixes are recorded above; no extension source or Blast runtime was changed.

Not done / risks: the seven Zipcodebase crashes need a future stack-enabled reproduction to confirm whether any Blast API beyond the documented headless/network behavior is involved.
