# Support matrix

Real Raycast extensions run through the full V2 pipeline: filesystem catalog,
child-process launch with esbuild bundling (`@raycast/api` resolved to the
compatibility adapter, React externalized), compatibility adapter, scene
renderer, and traffic relay. Committed fixtures are trimmed to manifest and
sources, so matrix runs are hermetic and deterministic.

- corpus: `raycast/extensions@d4aae99c5e1d7ec19b2341f1058c20adfd3fdc91`
- probed: all 3,231 extensions (bundle + render probe per extension)
- executable test: `packages/blast-e2e/test/support-matrix.test.mjs`
- fixture set: `packages/blast-e2e/test/fixtures/real/`

## Probe results over the corpus

| Outcome                                                            | Extensions | Share |
| ------------------------------------------------------------------ | ---------: | ----: |
| imports unmeasured APIs                                            |      2,960 | 91.6% |
| bundle or render failed (mostly unresolvable third-party packages) |        236 |  7.3% |
| structured compatibility error at render                           |         14 |  0.4% |
| renders a scene end to end                                         |         12 |  0.4% |
| no entrypoint found                                                |          1 |  0.0% |

Reading: this baseline probe predates the later measured-surface increments
below. At that snapshot, 12 extensions rendered after import filtering; the
dominant blockers were the unmeasured long tail (`useNavigation`,
`LocalStorage`, `environment`, `Color`, `open`, `confirmAlert`) and
third-party npm packages, which require vendoring or installation policy
before they can bundle. The later increments are covered by the executable
matrix, but the full corpus has not been re-probed yet.

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

- action groups, `ActionPanel.Section`, submenus, and tinted icons are
  measured; `Action.OpenInBrowser` and shortcut objects remain unsupported;
- toast lifecycle, mutable fields, and action callbacks are measured; client
  toast timing/stacking and toast-action shortcut objects remain unsupported;
- Form focus/blur callbacks;
- `useNavigation` and `Action.Push` (28.8% of extensions),
  `LocalStorage`/`Cache` (26.5%), and `environment` (19.7%) are measured in
  the adapter but still have limited fixture coverage;
- third-party npm dependency resolution (vendoring or installation policy).

These are ordered for the next surface increments in `status.md`.
