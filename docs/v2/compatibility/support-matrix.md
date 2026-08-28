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

Reading: with the current measured surface, roughly one in twelve of the
extensions that survive import filtering renders; the dominant blockers are
the unmeasured long tail (`useNavigation`, `LocalStorage`, `environment`,
`Color`, `Form`, `open`, `confirmAlert`) and third-party npm packages, which
require vendoring or installation policy before they can bundle.

## Committed fixtures

| Fixture                     | Root   | Items | Measured APIs                                                |
| --------------------------- | ------ | ----: | ------------------------------------------------------------ |
| `papersize`                 | list   |    42 | Action, ActionPanel, Icon, List                              |
| `golden-ratio`              | list   |     1 | Action, ActionPanel, Clipboard, Icon, List, showToast, Toast |
| `pokemon-tcg-pocket-binder` | list   |     6 | Action, ActionPanel, List, showToast, Toast                  |
| `ruby-evaluate`             | list   |     0 | Action, ActionPanel, List, Detail, getPreferenceValues       |
| `wifi-password-reveal`      | list   |     0 | Action, ActionPanel, Detail, Icon, List, showToast, Toast    |
| `go-links`                  | list   |     0 | Action, ActionPanel, Icon, List, showToast, Toast            |
| `utm-virtual-machines`      | list   |     0 | Action, ActionPanel, Icon, List, showToast, Toast            |
| `time`                      | detail |     0 | Detail                                                       |
| `deutscherwetterdienst`     | detail |     0 | Detail                                                       |
| `donut`                     | detail |     0 | Detail                                                       |
| `big-o`                     | —      |     — | expected `unsupported_api`: ActionPanel title prop           |
| `choose-a-license`          | —      |     — | expected `unsupported_api`: non-action ActionPanel child     |

The render fixtures assert root type and minimum item counts through real
child processes; the gap fixtures assert that unmeasured surface fails with
structured `unsupported_api` errors and a non-zero exit.

## Known gaps surfaced by the matrix

- `ActionPanel.title` and non-action ActionPanel children (submenus, `List.Item`
  inside panels) are common and unmeasured;
- toast display semantics, `Toast.hide`, and toast actions;
- `useNavigation` and `Action.Push` (28.8% of extensions);
- `LocalStorage`/`Cache` (26.5%), `environment` (19.7%), `Form` (38.5%),
  `Color` tinting (40.1%);
- third-party npm dependency resolution (vendoring or installation policy).

These are ordered for the next surface increments in `status.md`.
