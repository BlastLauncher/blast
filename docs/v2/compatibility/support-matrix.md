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
the explicit `vendored` dependency policy. The private e2e package now adds two
bounded, exact-version seeds for twenty low-risk utility, parser, and fetch
compatibility packages; their transitive graph is recorded in the lockfile.
The probe does not install the corpus or run package-manager scripts;
unavailable packages remain dependency failures.

| Outcome                        | Baseline | Previous post-slice | Current post-slice | Current vs previous |
| ------------------------------ | -------: | ------------------: | -----------------: | ------------------: |
| third-party dependency failure |    2,361 |               1,278 |                914 |                -364 |
| not renderable command mode    |      358 |                 316 |                316 |                   0 |
| other process/startup failure  |      432 |                 824 |                683 |                -141 |
| structured compatibility error |       23 |                 106 |                 27 |                 -79 |
| renders a scene end to end     |       54 |                 704 |              1,288 |                +584 |
| no entrypoint found            |        3 |                   3 |                  3 |                   0 |

Reading: the current post-slice extension pass rate is 1,288/3,231 (39.86%);
among the 2,915 extensions with a selected renderable command it is 1,288/2,915
(44.19%). The measured preference, navigation, environment, form-value,
keyboard, image-type, `randomId`, WindowManagement, small legacy aliases,
safe import shapes, Form focus/blur callbacks, nullable Form initial values,
empty string-valued controls, composite React children, and the observed icon
members are no longer in the non-rendering static blocker list. The only
remaining static import gap is one `fetch` import. The vendor root leaves
dependency failures tracked separately.
The current priority is the measured API boundary rather than another
dependency seed; this probe refresh measures the newly implemented command-
scoped preference boundary alongside the explicit icon-member, empty-string,
nullable Form initial-value, `LocalStorage.allItems`/`allLocalStorageItems`,
Form event, literal `require`, and composite-child surfaces before dependency
provisioning resumes. The next measured target is the `ActionPanel.Item` alias.

The first audited vendor seed is `axios@1.8.4`, `cheerio@1.0.0`,
`cross-fetch@4.0.0`, `date-fns@4.1.0`, `fast-xml-parser@5.3.2`, `fuse.js@7.1.0`,
`moment@2.30.1`, `node-html-markdown@1.3.0`, `rss-parser@3.13.0`, and
`zod@3.24.3`; it moved 317 extensions out of the dependency-failure class and
182 of those rendered scenes in its reprobe. The second seed is
`file-url@4.0.0`, `filesize@11.0.13`, `gray-matter@4.0.3`,
`javascript-time-ago@2.6.4`, `luxon@3.7.2`, `node-html-parser@7.0.1`,
`qrcode@1.5.4`, `tildify@3.0.0`, `ts-pattern@5.9.0`, and `turndown@7.2.0`;
it moved 44 more extensions out of the dependency-failure class and 27 of
those rendered scenes. The remaining dependency failures are still tracked
separately below.

## Committed fixtures

| Fixture                        | Root           | Items | Measured APIs                                                                                                                                                                                              |
| ------------------------------ | -------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `papersize`                    | list           |    42 | Action, ActionPanel, Icon, List                                                                                                                                                                            |
| `golden-ratio`                 | list           |     1 | Action, ActionPanel, Clipboard, Icon, List, showToast, Toast                                                                                                                                               |
| `pokemon-tcg-pocket-binder`    | list           |     6 | Action, ActionPanel, List, showToast, Toast                                                                                                                                                                |
| `ruby-evaluate`                | list           |     0 | Action, ActionPanel, List, Detail, getPreferenceValues                                                                                                                                                     |
| `wifi-password-reveal`         | list           |     0 | Action, ActionPanel, Detail, Icon, List, showToast, Toast                                                                                                                                                  |
| `go-links`                     | list           |     0 | Action, ActionPanel, Icon, List, showToast, Toast                                                                                                                                                          |
| `utm-virtual-machines`         | list           |     0 | Action, ActionPanel, Icon, List, showToast, Toast                                                                                                                                                          |
| `time`                         | detail         |     0 | Detail                                                                                                                                                                                                     |
| `deutscherwetterdienst`        | detail         |     0 | Detail                                                                                                                                                                                                     |
| `donut`                        | detail         |     0 | Detail                                                                                                                                                                                                     |
| `big-o`                        | list           |     3 | Action, ActionPanel, List                                                                                                                                                                                  |
| `balatro-compendium`           | list           |     3 | Action, ActionPanel, Detail, Icon, List, showToast, Toast                                                                                                                                                  |
| `cache-control-builder`        | list           |     3 | Action, ActionPanel, Detail, Icon, List, environment, useNavigation                                                                                                                                        |
| `single-disk-eject`            | list           |     0 | Action, ActionPanel, List, environment, getPreferenceValues, showToast, Toast                                                                                                                              |
| `form-submission`              | form           |     4 | Action, ActionPanel, Form (DatePicker, TagPicker, FilePicker)                                                                                                                                              |
| `composite-children`           | form           |     3 | Action, ActionPanel, Form, custom component and fragment composition                                                                                                                                       |
| `launch-boundaries`            | list           |     1 | Image masks, LaunchProps, LaunchType, closeMainWindow, popToRoot, openExtensionPreferences                                                                                                                 |
| `desktop-discovery-boundaries` | list           |     2 | Application, getApplications, getSelectedText, openCommandPreferences                                                                                                                                      |
| `finder-boundaries`            | list           |     2 | FileSystemItem, getFrontmostApplication, getSelectedFinderItems, showInFinder                                                                                                                              |
| `window-management-boundaries` | list           |     1 | WindowManagement, environment                                                                                                                                                                              |
| `legacy-alias-boundaries`      | list           |     1 | ActionPanel, ActionPanelItem, AlertActionStyle, Icon, List, ListSection, OpenWithAction                                                                                                                    |
| `import-shape-boundaries`      | list           |     1 | namespace, dynamic, side-effect, and literal require `@raycast/api` imports                                                                                                                                |
| `host-boundaries`              | list           |     1 | BrowserExtension, ToastStyle, Tool.Confirmation, clearSearchBar, trash                                                                                                                                     |
| `coverage-next`                | list           |     1 | CopyToClipboardAction, OpenInBrowserAction, getPreferenceValues, environment, preferences, randomId, and legacy type aliases                                                                               |
| `coverage-followup`            | form           |     2 | ImageMask, List, OpenAction, PasteAction, PushAction, SubmitFormAction, clearLocalStorage, copyTextToClipboard, getLocalStorageItem, pasteText, removeLocalStorageItem, setLocalStorageItem, useNavigation |
| `runtime-boundaries`           | list           |     1 | AI, OAuth, updateCommandMetadata                                                                                                                                                                           |
| `grid-boundaries`              | grid           |     2 | Grid, Grid.Item, Grid.Section, Grid.Dropdown, Grid.EmptyView, Icon                                                                                                                                         |
| `menu-bar-boundaries`          | menu-bar-extra |     2 | MenuBarExtra, Item, Section, Submenu, Separator, Icon                                                                                                                                                      |
| `choose-a-license`             | list           |     8 | Action.OpenInBrowser, Action.CopyToClipboard, Action.Push                                                                                                                                                  |

The twenty-eight matrix render fixtures assert root type and minimum item counts
through real child processes; the desktop-discovery fixture additionally waits
for three brokered capability responses, the Finder fixture waits for three
additional capability responses, and the form fixture dispatches text, date,
tag-array, and file-path changes plus a submit event with client-provided
values. The launch-boundaries fixture is also exercised by the vertical suite.
The runtime-boundaries fixture waits for an AI response, command subtitle
update, and OAuth token lookup; the host-boundaries fixture waits for browser
tab/content, search, and trash capability responses; the `coverage-next`
fixture additionally exercises default-application and telemetry responses
plus deprecated and modern browser/clipboard action events. The
`coverage-followup` fixture additionally exercises legacy form, open, paste,
storage, image-mask, and push/pop aliases, including navigation calls from a
separately bundled child view. The `window-management-boundaries` fixture
waits for active-window, desktop-window, and desktop-list responses, then
dispatches a bounds mutation through the explicit host capability.

## Known gaps surfaced by the matrix

- action groups, `ActionPanel.Section`, submenus, tinted icons, shortcut
  objects, action styles, `autoFocus`, `Action.OpenInBrowser`, `Action.Open`,
  `Action.Paste`, and the deprecated browser/clipboard/action aliases are
  measured; custom React components/fragments can compose action children;
  broader action helpers remain unsupported;
- toast lifecycle, mutable fields, action callbacks, and toast-action shortcut
  objects are measured; client toast timing/stacking remains unsupported;
- `useNavigation` and `Action.Push` (28.8% of extensions),
  `LocalStorage`/`Cache` (26.5%), and `environment` (19.7%) are measured in
  the adapter but still have limited fixture coverage. `LocalStorage.allItems`
  and `allLocalStorageItems` now share the brokered storage boundary; the
  legacy push, open,
  paste, storage, preference, environment, and `ImageMask` aliases are covered
  by the `coverage-followup` and `coverage-next` fixtures;
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
- `WindowManagement` discovery and bounds mutation are measured through the
  explicit `window-management` capability, including validated desktop/window
  result shapes and JSON-encoded bounds options. Deterministic providers make
  corpus and fixture runs reproducible; production window enumeration,
  permission/consent state, and OS bounds mutation remain host work;
- `List.Section`/`ListSection`, `ActionPanelItem`, `AlertActionStyle`,
  `OpenWithAction`, and legacy `render(<Command />)` are measured. List sections
  cross as semantic `list-section` nodes, and Open With intent crosses the
  existing `open.open` capability as a primitive `openWith` flag; client list
  section rendering and the application chooser remain host/client work;
- namespace imports, literal dynamic imports, literal side-effect imports, and
  literal CommonJS `require("@raycast/api")` calls resolve through the same
  launcher alias as named imports when they access measured adapter members.
  The remaining `fetch` import is intentionally not supported because network
  access needs an explicit host capability and policy;
- custom function components and React fragments can compose measured action,
  list, grid, menu-bar, and form children; raw text, intrinsic DOM elements,
  and invalid resolved children remain outside the semantic scene contract;
- nullable async state is accepted as a top-level `null` initial value for
  non-date Form controls and omitted from the scene props; DatePicker retains
  its native `Date | null` behavior, while null members inside string arrays
  remain invalid;
- string-valued Form and Grid dropdown labels and values, Form checkbox labels,
  and Form descriptions preserve empty strings; non-string values remain
  invalid;
- the `Icon` export now includes the observed named members used by the focused
  18-command diagnostic, including numbered, progress, disabled, and formatting
  variants; it remains an explicit measured subset, and unknown members remain
  structured compatibility failures;
- command-scoped manifest preference defaults are merged into the selected
  command descriptor, with command values taking precedence over extension-level
  values; the focused Grid-column failures now proceed past `getPreferenceValues()`
  into their later measured boundaries;
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
