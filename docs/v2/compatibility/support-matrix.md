# Support matrix

Real Raycast extensions run through the full V2 pipeline: filesystem catalog,
child-process launch with esbuild bundling (`@raycast/api` resolved to the
compatibility adapter, React externalized), compatibility adapter, scene
renderer, and traffic relay. Committed fixtures are trimmed to manifest and
sources, so matrix runs are hermetic and deterministic.

- corpus: `raycast/extensions@d4aae99c5e1d7ec19b2341f1058c20adfd3fdc91`
- probed: all 3,231 extensions (one deterministic command probe per extension)
- executable test: `packages/blast-e2e/test/support-matrix.test.mjs`
- reproducible corpus probe: `packages/blast-e2e/scripts/probe-corpus.mjs`
- fixture set: `packages/blast-e2e/test/fixtures/real/`

## Corpus probe results

The probe uses the pinned corpus revision and the source-only checkout used
for runtime execution. It selects the first command declared with `mode:
"view"`, falling back to the first command whose mode is unset and then the
first `menu-bar` command; extensions with only `no-view` commands are counted
but are not renderable by the scene contract. The pre-slice result is preserved in
[`runtime-probe-baseline.json`](./runtime-probe-baseline.json). The current
post-slice result, including one result per extension, is
[`runtime-probe-post-slice.json`](./runtime-probe-post-slice.json).

The current post-slice run supplies the workspace's installed packages through
the explicit `vendored` dependency policy. It does not install the corpus or
run package-manager scripts; unavailable packages remain dependency failures.

| Outcome                        | Baseline | Previous post-slice | Current post-slice | Current vs previous |
| ------------------------------ | -------: | ------------------: | -----------------: | ------------------: |
| third-party dependency failure |    2,361 |               1,276 |              1,278 |                  +2 |
| not renderable command mode    |      358 |                 316 |                316 |                   0 |
| other process/startup failure  |      432 |                 982 |                850 |                -132 |
| structured compatibility error |       23 |                  91 |                 94 |                  +3 |
| renders a scene end to end     |       54 |                 552 |                690 |                +138 |
| no entrypoint found            |        3 |                   3 |                  3 |                   0 |

Reading: the current post-slice extension pass rate is 690/3,231 (21.36%);
among the 2,915 extensions with a selected renderable command it is 690/2,915
(23.67%). The high-impact `Grid`, `launchCommand`, `MenuBarExtra`, LaunchProps,
window/navigation, `Image`, selected-text, application-discovery, command-
preference, Finder, frontmost-application, AI, OAuth, command-metadata,
`BrowserExtension`, `ToastStyle`, `clearSearchBar`, `trash`,
`captureException`, `OpenInBrowserAction`, `CopyToClipboardAction`,
`getDefaultApplication`, and `PreferenceValues` blockers are no longer in the
static list. Remaining named static blockers on non-rendering extensions are
led by `SubmitFormAction` (11), `getLocalStorageItem` (10),
`setLocalStorageItem` (9), `ImageMask` (8), and `PushAction` (8); dynamic and
namespace imports remain separate unknown-shape work. The vendor root still
leaves 1,278 dependency failures, so the next coverage group should combine
the named alias/type blockers with the audited dependency provisioning
decision.

## Committed fixtures

| Fixture                        | Root           | Items | Measured APIs                                                                                         |
| ------------------------------ | -------------- | ----: | ----------------------------------------------------------------------------------------------------- |
| `papersize`                    | list           |    42 | Action, ActionPanel, Icon, List                                                                       |
| `golden-ratio`                 | list           |     1 | Action, ActionPanel, Clipboard, Icon, List, showToast, Toast                                          |
| `pokemon-tcg-pocket-binder`    | list           |     6 | Action, ActionPanel, List, showToast, Toast                                                           |
| `ruby-evaluate`                | list           |     0 | Action, ActionPanel, List, Detail, getPreferenceValues                                                |
| `wifi-password-reveal`         | list           |     0 | Action, ActionPanel, Detail, Icon, List, showToast, Toast                                             |
| `go-links`                     | list           |     0 | Action, ActionPanel, Icon, List, showToast, Toast                                                     |
| `utm-virtual-machines`         | list           |     0 | Action, ActionPanel, Icon, List, showToast, Toast                                                     |
| `time`                         | detail         |     0 | Detail                                                                                                |
| `deutscherwetterdienst`        | detail         |     0 | Detail                                                                                                |
| `donut`                        | detail         |     0 | Detail                                                                                                |
| `big-o`                        | list           |     3 | Action, ActionPanel, List                                                                             |
| `balatro-compendium`           | list           |     3 | Action, ActionPanel, Detail, Icon, List, showToast, Toast                                             |
| `cache-control-builder`        | list           |     3 | Action, ActionPanel, Detail, Icon, List, environment, useNavigation                                   |
| `single-disk-eject`            | list           |     0 | Action, ActionPanel, List, environment, getPreferenceValues, showToast, Toast                         |
| `form-submission`              | form           |     4 | Action, ActionPanel, Form (DatePicker, TagPicker, FilePicker)                                         |
| `launch-boundaries`            | list           |     1 | Image masks, LaunchProps, LaunchType, closeMainWindow, popToRoot, openExtensionPreferences            |
| `desktop-discovery-boundaries` | list           |     2 | Application, getApplications, getSelectedText, openCommandPreferences                                 |
| `finder-boundaries`            | list           |     2 | FileSystemItem, getFrontmostApplication, getSelectedFinderItems, showInFinder                         |
| `host-boundaries`              | list           |     1 | BrowserExtension, ToastStyle, Tool.Confirmation, clearSearchBar, trash                                |
| `coverage-next`                | list           |     1 | CopyToClipboardAction, OpenInBrowserAction, PreferenceValues, captureException, getDefaultApplication |
| `runtime-boundaries`           | list           |     1 | AI, OAuth, updateCommandMetadata                                                                      |
| `grid-boundaries`              | grid           |     2 | Grid, Grid.Item, Grid.Section, Grid.Dropdown, Grid.EmptyView, Icon                                    |
| `menu-bar-boundaries`          | menu-bar-extra |     2 | MenuBarExtra, Item, Section, Submenu, Separator, Icon                                                 |
| `choose-a-license`             | list           |     8 | Action.OpenInBrowser, Action.CopyToClipboard, Action.Push                                             |

The twenty-three matrix render fixtures assert root type and minimum item counts
through real child processes; the desktop-discovery fixture additionally waits
for three brokered capability responses, the Finder fixture waits for three
additional capability responses, and the form fixture dispatches text, date,
tag-array, and file-path changes plus a submit event with client-provided
values. The launch-boundaries fixture is also exercised by the vertical suite.
The runtime-boundaries fixture waits for an AI response, command subtitle
update, and OAuth token lookup; the host-boundaries fixture waits for browser
tab/content, search, and trash capability responses; the `coverage-next`
fixture additionally exercises default-application and telemetry responses
plus deprecated and modern browser/clipboard action events.

## Known gaps surfaced by the matrix

- action groups, `ActionPanel.Section`, submenus, tinted icons, shortcut
  objects, action styles, `autoFocus`, `Action.OpenInBrowser`, and the
  deprecated browser/clipboard action aliases are measured; broader action
  helpers remain unsupported;
- toast lifecycle, mutable fields, action callbacks, and toast-action shortcut
  objects are measured; client toast timing/stacking remains unsupported;
- Form focus/blur callbacks;
- `useNavigation` and `Action.Push` (28.8% of extensions),
  `LocalStorage`/`Cache` (26.5%), and `environment` (19.7%) are measured in
  the adapter but still have limited fixture coverage;
- `showHUD`, `open`, and `confirmAlert` are measured through capability
  requests, but production host providers and consent policy are still absent;
- `LaunchProps`, `LaunchType`, `Image.Mask`, `closeMainWindow`, `popToRoot`,
  `openExtensionPreferences`, `Grid`, `MenuBarExtra`, and `launchCommand` are
  measured. Launch props default to a
  user-initiated launch with an empty argument map in the current launcher;
  explicit command launching is brokered, while host-side target resolution
  and process orchestration remain future client plumbing;
- `getSelectedText`, `getApplications`, `Application`, `FileIcon`, and
  `openCommandPreferences` are measured through `selection.read`,
  `application.list`, and `preferences.openCommand`; deterministic providers
  make corpus and fixture runs reproducible, while production OS providers and
  consent policy remain absent;
- `getSelectedFinderItems`, `showInFinder`, `FileSystemItem`, and
  `getFrontmostApplication` are measured through `finder.selectedItems`,
  `finder.show`, and `application.frontmost`; deterministic providers make
  corpus and fixture runs reproducible, while production Finder/frontmost
  application providers and consent policy remain absent;
- `BrowserExtension.getTabs`, `BrowserExtension.getContent`, `clearSearchBar`,
  `trash`, `ToastStyle`, and the type-only `Tool.Confirmation` contract are
  measured. Browser integration, navigation state, destructive filesystem
  behavior, and permission/consent policy remain host work; broader browser,
  action, and Tool APIs remain unsupported;
- `captureException`, `getDefaultApplication`, `PreferenceValues`,
  `OpenInBrowserAction`, and `CopyToClipboardAction` are measured. Exception
  payloads, default-application results, and action activation are brokered;
  telemetry retention, desktop integration, clipboard policy, and consent
  remain production host work;
- `AI.ask` is measured through `ai.ask`, including creativity/model option
  normalization, abort preflight, and the final-result `.on("data")` adapter;
  model execution and streaming providers remain host work;
- `OAuth.PKCEClient` is measured through host-owned `oauth` operations for
  authorization requests, browser authorization, token storage, lookup, and
  removal. PKCE generation, browser routing, secure storage, consent, and
  provider-specific network flows remain production host work;
- `updateCommandMetadata` is measured through `command.updateMetadata` for
  subtitle updates and explicit `null` clears; client-side command chrome is
  still future work;
- third-party npm dependency availability (the post-slice report records these
  as `third-party-dependency`; vendored roots are explicit but not yet a full
  audited corpus dependency set).

These are ordered for the next surface increments in `status.md`.
