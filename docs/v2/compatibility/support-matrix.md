# Support matrix

Real Raycast extensions run through the full V2 pipeline: filesystem catalog,
child-process launch with esbuild bundling (`@raycast/api` resolved to the
compatibility adapter, React externalized), compatibility adapter, scene
renderer, and traffic relay. Committed fixtures are trimmed to manifest and
sources, so matrix runs are hermetic and deterministic.

- corpus: `raycast/extensions@d4aae99c5e1d7ec19b2341f1058c20adfd3fdc91`
- probed: all 3,231 extensions (one deterministic view-command probe per extension)
- executable test: `packages/blast-e2e/test/support-matrix.test.mjs`
- reproducible corpus probe: `packages/blast-e2e/scripts/probe-corpus.mjs`
- fixture set: `packages/blast-e2e/test/fixtures/real/`

## Corpus probe results

The probe uses the pinned corpus revision and the source-only checkout used
for runtime execution. It selects the first command declared with `mode:
"view"`, falling back to the first command whose mode is unset; extensions
with only `no-view` or `menu-bar` commands are counted but are not renderable
by the scene contract. The pre-slice result is preserved in
[`runtime-probe-baseline.json`](./runtime-probe-baseline.json). The current
post-slice result, including one result per extension, is
[`runtime-probe-post-slice.json`](./runtime-probe-post-slice.json).

The post-slice run supplies the workspace's installed packages through the
explicit `vendored` dependency policy. It does not install the corpus or run
package-manager scripts; unavailable packages remain dependency failures.

| Outcome                        | Pre-slice | Post-slice | Change |
| ------------------------------ | --------: | ---------: | -----: |
| third-party dependency failure |     2,361 |      1,266 | -1,095 |
| not renderable command mode    |       358 |        358 |      0 |
| other process/startup failure  |       432 |      1,279 |   +847 |
| structured compatibility error |        23 |         82 |    +59 |
| renders a scene end to end     |        54 |        243 |   +189 |
| no entrypoint found            |         3 |          3 |      0 |

Reading: the post-slice extension pass rate is 243/3,231 (7.52%); among the
2,873 extensions with a selected renderable command it is 243/2,873 (8.46%).
The high-impact shortcut, HUD, open, alert, and cache blockers are no longer
in the static list. Remaining static blockers on non-rendering extensions are
led by `LaunchProps` (552), `closeMainWindow` (533), `popToRoot` (507),
`openExtensionPreferences` (444), `Image` (422), `launchCommand` (299), and
`Grid` (292). The vendor root removes 1,095 dependency failures, but 1,266
remain; the next coverage group should combine audited dependency provisioning
with the dominant API blockers.

## Committed fixtures

| Fixture                     | Root   | Items | Measured APIs                                                                 |
| --------------------------- | ------ | ----: | ----------------------------------------------------------------------------- |
| `papersize`                 | list   |    42 | Action, ActionPanel, Icon, List                                               |
| `golden-ratio`              | list   |     1 | Action, ActionPanel, Clipboard, Icon, List, showToast, Toast                  |
| `pokemon-tcg-pocket-binder` | list   |     6 | Action, ActionPanel, List, showToast, Toast                                   |
| `ruby-evaluate`             | list   |     0 | Action, ActionPanel, List, Detail, getPreferenceValues                        |
| `wifi-password-reveal`      | list   |     0 | Action, ActionPanel, Detail, Icon, List, showToast, Toast                     |
| `go-links`                  | list   |     0 | Action, ActionPanel, Icon, List, showToast, Toast                             |
| `utm-virtual-machines`      | list   |     0 | Action, ActionPanel, Icon, List, showToast, Toast                             |
| `time`                      | detail |     0 | Detail                                                                        |
| `deutscherwetterdienst`     | detail |     0 | Detail                                                                        |
| `donut`                     | detail |     0 | Detail                                                                        |
| `big-o`                     | list   |     3 | Action, ActionPanel, List                                                     |
| `balatro-compendium`        | list   |     3 | Action, ActionPanel, Detail, Icon, List, showToast, Toast                     |
| `cache-control-builder`     | list   |     3 | Action, ActionPanel, Detail, Icon, List, environment, useNavigation           |
| `single-disk-eject`         | list   |     0 | Action, ActionPanel, List, environment, getPreferenceValues, showToast, Toast |
| `form-submission`           | form   |     4 | Action, ActionPanel, Form (DatePicker, TagPicker, FilePicker)                 |
| `choose-a-license`          | —      |     — | expected `unsupported_api`: Action.OpenInBrowser                              |

The fifteen render fixtures assert root type and minimum item counts through
real child processes; the form fixture additionally dispatches text, date,
tag-array, and file-path changes plus a submit event with client-provided
values. The gap fixture asserts that unmeasured surface fails with a
structured `unsupported_api` error and a non-zero exit.

## Known gaps surfaced by the matrix

- action groups, `ActionPanel.Section`, submenus, tinted icons, shortcut
  objects, action styles, and `autoFocus` are measured; `Action.OpenInBrowser`
  and broader action helpers remain unsupported;
- toast lifecycle, mutable fields, action callbacks, and toast-action shortcut
  objects are measured; client toast timing/stacking remains unsupported;
- Form focus/blur callbacks;
- `useNavigation` and `Action.Push` (28.8% of extensions),
  `LocalStorage`/`Cache` (26.5%), and `environment` (19.7%) are measured in
  the adapter but still have limited fixture coverage;
- `showHUD`, `open`, and `confirmAlert` are measured through capability
  requests, but production host providers and consent policy are still absent;
- third-party npm dependency availability (the post-slice report records these
  as `third-party-dependency`; vendored roots are explicit but not yet a full
  audited corpus dependency set).

These are ordered for the next surface increments in `status.md`.
