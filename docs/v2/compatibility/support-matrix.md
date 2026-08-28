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

## Current baseline probe

The current probe uses the pinned corpus revision and the source-only
checkout used for runtime execution. It selects the first command declared
with `mode: "view"`, falling back to the first command whose mode is unset;
extensions with only `no-view` or `menu-bar` commands are counted but are not
renderable by the scene contract. The complete deterministic result, including
one result per extension, is [`runtime-probe-baseline.json`](./runtime-probe-baseline.json).

| Outcome                        | Extensions | Share |
| ------------------------------ | ---------: | ----: |
| third-party dependency failure |      2,361 | 73.1% |
| not renderable command mode    |        358 | 11.1% |
| other process/startup failure  |        432 | 13.4% |
| structured compatibility error |         23 |  0.7% |
| renders a scene end to end     |         54 |  1.7% |
| no entrypoint found            |          3 |  0.1% |

Reading: the extension pass rate is 54/3,231 (1.67%); among the 2,873
extensions with a selected renderable command it is 54/2,873 (1.88%). Static
API blockers on non-rendering extensions are led by `showHUD` (829), `open`
(820), `confirmAlert` (747), `Alert` (621), `Keyboard` (587), and `Cache`
(291). The largest operational blocker is missing third-party packages, so
the next implementation group addresses both the high-impact adapter APIs and
the dependency policy that makes those probes meaningful.

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
- third-party npm dependency resolution (the baseline records these as
  `third-party-dependency`; the policy slice is next).

These are ordered for the next surface increments in `status.md`.
