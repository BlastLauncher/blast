# Blast V2 implementation status

This is the handoff ledger for future contributors and agents. Update it when a
slice changes what is executable, what is trusted, or what should happen next.

## Executable today

- A transport-independent protocol validates envelopes, peer identities,
  handshake messages, errors, and shutdown.
- Asymmetric sessions negotiate the highest shared version, assign one session
  ID, enforce ready/closing/closed/failed states, and fail closed on invalid or
  mismatched messages.
- Every transport can run one reusable conformance suite. Both the deterministic
  in-memory transport and the Node.js JSON-lines stream transport pass it.
- The extension lifecycle contract separates protocol readiness from command
  readiness with validated `extension.initialize` and `extension.ready`
  messages.
- The runtime-side framework negotiates with an extension host, validates its
  initialization descriptor, invokes an injected initialization hook, and
  acknowledges the exact command identity.
- The Node runtime bootstrap loads the descriptor's immutable entrypoint
  through the ECMAScript module loader, publishes it to an observer, and
  drains messages until shutdown, in child processes and in-memory tests.
- The semantic scene contract validates `scene.transaction` and `scene.event`
  messages, applies ordered snapshot/insert/update/remove/reorder operations
  to a materialized client state, and exposes the transport-independent
  mutation sink the React renderer will publish to.
- The runtime publishes validated scene transactions over its session through
  the extension channel and receives `scene.event` messages back; the Node
  bootstrap invokes the entrypoint's command export with a context of
  descriptor, publish, event handler, and capability requester.
- The capability broker denies every request by default; granted requests flow
  from the command context through the host to a provider and back as
  structured responses, with the host verifying request identity against the
  session descriptor.
- The core relays extension session traffic to a client-side scene sink and
  capability broker over a single validated receive pump, sends `scene.event`
  messages back toward the extension, and fails closed on invalid traffic.
- The extension host reserves identities, supervises startup and stopping,
  publishes only initialized sessions, removes exited processes, and exposes an
  async lifecycle event stream.
- The Node launcher runs a fixed bootstrap in a dedicated OS process with an
  explicit environment, bounded stdio protocol frames, stderr capture, and
  escalating shutdown.
- A real child-process integration fixture proves the complete lifecycle without
  Electron or WebSocket; failure fixtures cover a pre-handshake crash and a
  process that requires forced termination.
- The core accepts only stable command identities, resolves paths through a
  trusted catalog, delegates lifecycle, and coordinates shutdown with in-flight
  starts.
- The Node filesystem catalog discovers Raycast-style `package.json` manifests,
  probes `src/<command-name>` entrypoints, honors explicit entrypoint
  overrides, and never resolves a path outside the extension root.
- An end-to-end vertical slice runs over real child processes without
  Electron: the catalog resolves a manifest fixture, the launcher starts the
  fixed bootstrap, the runtime publishes a list scene, an action event flows
  back and the extension updates the list, a granted clipboard write reaches
  a broker provider while an ungranted read is denied, and a deliberate
  crash removes the session while the core keeps serving.
- The React renderer adapter runs a React tree on react-reconciler and
  publishes one ordered scene transaction per synchronous commit: a full
  snapshot for the first commit and recovery, then insert/update/remove
  operations with stable node identifiers, whitelisted props, and stable
  event identifiers for action and form-control callbacks. Nested removals are
  coalesced so a deleted subtree cannot leave stale child updates or inserts in
  the mutation stream.
- The Raycast compatibility adapter implements the census-measured view
  stack (List, List.Item, ActionPanel, Action, Detail, Form, Icon) over the
  renderer, routes Clipboard through the capability broker, and raises
  structured errors for unmeasured surface; a Raycast-style fixture
  extension runs end to end over child processes.
- The Node bootstrap bundles entrypoints with esbuild (TypeScript/JSX and
  literal `@raycast/api` imports resolved by launcher-provided aliases) and
  renders default-exported command components through the adapter, so
  unmodified Raycast-style TSX fixtures run end to end. Default temporary
  bundle directories are removed after each successful or failed load, with
  synchronous signal/exit cleanup for interrupted runtimes; an explicitly
  supplied cache directory remains caller-owned. The corpus probe uses
  run-scoped prefixes and reclaims its bundle directories after each run.
- The support matrix runs a committed set of real corpus extensions through
  the full pipeline in CI: twenty-eight render fixtures (list, list sections,
  and detail,
  navigation, action groups, tinted icons, form controls, toasts, preferences,
  brokered clipboard, desktop and window-management boundaries, legacy
  action/storage/list/render aliases, and cross-bundle navigation),
  while the corpus probe records exactly which unmeasured APIs block the rest.
- The e2e corpus probe has a bounded, exact-version development-only vendor
  seed for `axios`, `cheerio`, `cross-fetch`, `date-fns`, `fast-xml-parser`,
  `fuse.js`, `moment`, `node-html-markdown`, `rss-parser`, and `zod`. The seed
  is supplied by the explicit workspace vendor root; the runtime still never
  installs or downloads extension dependencies.
- A second bounded seed adds `file-url`, `filesize`, `gray-matter`,
  `javascript-time-ago`, `luxon`, `node-html-parser`, `qrcode`, `tildify`,
  `ts-pattern`, and `turndown`, also as exact-version e2e development
  dependencies. A third bounded seed adds `@chrismessina/raycast-logger`,
  `@tanstack/react-query`, `algoliasearch`, `jimp`, `openai`,
  `raycast-cross-extension`, `remove-markdown`, `striptags`, `swr`,
  `untildify`, and `use-debounce`. The latest pinned corpus probe passes
  1,866 of 3,231 extensions (57.75%), or 1,866 of 2,915 extensions with a
  selected renderable command (64.01%). The remaining losses are tracked
  separately: 844 third-party dependency failures, 201 process/startup
  failures, 316 non-renderable commands, 1 structured compatibility error,
  and 3 missing entrypoints. The targeted zero-pagination and OpenInBrowser
  reprobes are deterministic; aggregate changes also include normal process
  and dependency variance.
- A fourth bounded seed adds 22 exact-version e2e development dependencies:
  `adm-zip`, `bplist-parser`, `change-case`, `chrono-node`, `d3-color`,
  `date-fns-tz`, `graphql-tag`, `image-size`, `jotai`, `json2md`, `linkedom`,
  `marked`, `moment-timezone`, `papaparse`, `parse-git-config`, `pinyin-pro`,
  `pretty-bytes`, `query-string`, `raycast-toolkit`, `slugify`, `timeago.js`,
  and `turndown-plugin-gfm`. The latest pinned corpus probe passes 1,912 of
  3,231 extensions (59.18%), or 1,912 of 2,915 extensions with a selected
  renderable command (65.59%). The remaining losses are tracked separately:
  797 third-party dependency failures, 202 process/startup failures, 316
  non-renderable commands, 1 structured compatibility error, and 3 missing
  entrypoints. The focused context-provider reprobe moves `dictionary/fromCmd`
  through to a rendered scene; the aggregate change remains subject to normal
  process and dependency variance.
- A fifth bounded seed adds 17 exact-version e2e development dependencies:
  `@mozilla/readability`, `bignumber.js`, `color-hash`, `cron-parser`,
  `dateformat`, `dedent-js`, `eventsource-parser`, `fast-fuzzy`, `fuzzysort`,
  `hi-base32`, `html-to-text`, `jose`, `js-base64`, `lodash.groupby`,
  `numeral`, `otpauth`, and `validator`. The latest pinned corpus probe passes
  1,938 of 3,231 extensions (59.98%), or 1,938 of 2,915 extensions with a
  selected renderable command (66.48%). The remaining losses are tracked
  separately: 770 third-party dependency failures, 202 process/startup
  failures, 316 non-renderable commands, 2 structured compatibility errors,
  and 3 missing entrypoints. The targeted fifth-seed reprobe rendered 24 of
  the previous dependency failures; the aggregate change remains subject to
  normal process and dependency variance.
- A sixth bounded seed adds 17 exact-version e2e development dependencies:
  `@noble/hashes`, `bs58`, `crypto-js`, `culori`, `currency-codes`, `exifr`,
  `jwt-decode`, `lodash.orderby`, `lunar-date-vn`, `node-localstorage`,
  `otplib`, `parse-github-url`, `proper-url-join`, `ramda`,
  `react-error-boundary`, `tiny-relative-date`, and `usehooks-ts`. The latest
  pinned corpus probe passes 1,948 of 3,231 extensions (60.29%), or 1,948 of
  2,915 extensions with a selected renderable command (66.83%). The remaining
  losses are tracked separately: 754 third-party dependency failures, 210
  process/startup failures, 316 non-renderable commands, no structured
  compatibility errors, and 3 missing entrypoints. The targeted sixth-seed
  reprobe rendered 13 of the previous dependency failures; the aggregate
  change remains subject to normal process and dependency variance.
- A seventh bounded seed adds 20 exact-version e2e development dependencies:
  `color-namer`, `cronstrue`, `csv-parse`, `debounce`, `dedupe`, `fromnow`,
  `image-meta`, `is-image`, `is-valid-domain`, `lodash.isempty`,
  `lodash.unescape`, `nzh`, `parse-url`, `simple-plist`, `tiny-pinyin`,
  `title`, `use-interval`, `url-join`, `weeknumber`, and `xml-js`. The latest
  pinned corpus probe passes 1,967 of 3,231 extensions (60.88%), or 1,967 of
  2,915 extensions with a selected renderable command (67.48%). The remaining
  losses are tracked separately: 734 third-party dependency failures, 209
  process/startup failures, 316 non-renderable commands, 2 structured
  compatibility errors, and 3 missing entrypoints. The targeted seventh-seed
  reprobe rendered 18 of the previous dependency failures and moved 4 to
  process/runtime failures; the aggregate change remains subject to normal
  process and dependency variance.
- An eighth bounded seed adds 13 exact-version e2e development dependencies:
  `@faker-js/faker`, `@iarna/toml`, `@nem035/gpt-3-encoder`,
  `@total-typescript/ts-reset`, `@web3-storage/parse-link-header`, `calendar`,
  `expand-tilde`, `formdata-node`, `fzf`, `p-queue`, `react-use`, `stream-json`,
  and `valibot`. The latest pinned corpus probe passes 1,980 of 3,231
  extensions (61.28%), or 1,980 of 2,915 extensions with a selected renderable
  command (67.92%). The remaining losses are tracked separately: 709
  third-party dependency failures, 222 process/startup failures, 316
  non-renderable commands, 1 structured compatibility error, and 3 missing
  entrypoints. The targeted eighth-seed reprobe rendered 20 of the previous
  dependency failures and moved 6 to process/runtime failures; the aggregate
  change remains subject to normal process and dependency variance.
- Navigation (useNavigation, Action.Push), LocalStorage through the
  capability broker with a reference in-memory provider, the callable plus
  property-based environment surface, and measured WindowManagement discovery
  and bounds operations are measured adapter APIs; the navigation stack retains
  entries and pop lifecycle callbacks, and only the top view contributes scene
  nodes. A realm-shared navigation proxy keeps bundled extension calls
  connected to the host-owned stack. Window-management data is JSON-encoded
  across explicit capability operations, and bounds mutation remains
  host-authorized.
- `LocalStorage.allItems` and the deprecated `allLocalStorageItems` alias now
  return the complete extension-local primitive-value map through a JSON
  encoded `local-storage.getAll` capability response; malformed responses are
  rejected before reaching extension code.
- Form field `onFocus` and `onBlur` callbacks now publish separate scene event
  IDs and receive validated `Form.Event` values reconstructed from the
  client-provided or runtime-retained field value. Literal CommonJS
  `require("@raycast/api")` imports are also covered alongside the measured
  dynamic, namespace, and side-effect import shapes.
- Non-date Form controls tolerate the common runtime shape of a top-level
  `null` initial value by omitting it from the scene and form runtime; strict
  validation still rejects wrong array members and other invalid types, while
  `DatePicker` preserves its native `Date | null` value semantics.
- String-valued Form and Grid dropdown labels and values accept empty strings
  because the pinned Raycast declarations require string types without a
  non-empty constraint; non-string values remain rejected at the adapter edge.
- The `Icon` export now mirrors all 478 members of the pinned Raycast
  declaration, while retaining legacy corpus names as explicit aliases;
  unknown members remain rejected rather than resolving through a fallback.
  `Color` emits Raycast's `raycast-*` theme identifiers while retaining the
  legacy raw `Pink` and `Brown` values.
- Command-scoped manifest preference defaults now cross the catalog boundary:
  focused diagnostics identified four Grid-column failures caused by
  `getPreferenceValues()` omitting preferences declared on the selected
  command; those defaults now cross the catalog boundary.
- `ActionPanel.Item` is an identity-preserving alias of the measured action
  component, so extensions using the nested Raycast spelling share the same
  validation, event IDs, and scene serialization. Focused corpus diagnostics
  moved `iridium`, `markdown-reference`, and `vivaldi` through to rendered
  scenes; invalid action children remain structured compatibility errors.
- Whitespace-only text nodes produced by JSX formatting are ignored in measured
  collection mappers for forms, pickers, lists, grids, menus, and action
  groups. Meaningful text and invalid elements remain rejected; the canonical
  reprobe moved six formatting-only corpus failures through to rendered scenes.
- `Form.searchBarAccessory` accepts the measured `Form.LinkAccessory`, which
  serializes its target and text as a semantic accessory node and routes its
  open event through the existing `open.open` capability. Invalid accessory
  values remain structured compatibility errors.
- `Action.CreateQuicklink` and `Action.PickDate` now render through the shared
  action node. Quicklink payloads are validated and sent as JSON through the
  explicit `quicklink.create` capability; date-picker options cross the
  explicit `date-picker.pick` capability and restore an ISO result to
  `Date | null`. Deprecated direct `Form.DropdownItem`,
  `Form.DropdownSection`, and `Form.TagPickerItem` members preserve the same
  component identities as their nested counterparts.
- `Action.ShowInFinder` and `Action.Trash` now render through the shared action
  node and route normalized `PathLike` values through the existing
  `finder.show` and `filesystem.trash` capabilities. Deprecated direct action
  aliases preserve those component identities; activation callbacks run only
  after a successful host response.
- `Action.CreateSnippet` validates the measured `{ text, name?, keyword? }`
  payload and routes it through `snippet.create`; `Action.ToggleQuickLook`
  routes through `quick-look.toggle`. List and Grid item Quick Look metadata
  serializes validated paths and optional names into the scene, and the
  explicit icon subset includes `Icon.Snippets`.
- `Action.OpenInBrowser` preserves declaration-valid empty string URLs during
  loading and omits the action when its required URL is absent at runtime;
  host opening still validates non-empty targets on activation. The targeted
  reprobe moved `get-cat-images`, `manifest-viewer`, `vikunja`, and
  `webpage-to-markdown` through to rendered scenes.
- `Detail.Metadata` and `List.Item.Detail` now serialize measured labels,
  separators, links, tag lists, loading state, and navigation titles as
  explicit scene nodes. `List.isShowingDetail` plus title/subtitle tooltip
  descriptors are preserved, and `List.Item.Detail.Metadata` is the same
  measured metadata surface. The corpus also uses `Action.SubmitForm` as a
  generic Detail action; outside a Form its callback receives an empty value
  bag. `Icon.CircleProgress` and `Icon.AppWindowList` are now measured
  members.
- `List`, `Grid`, and `Form.Dropdown` now carry the declaration-backed search
  lifecycle, filtering, loading, and pagination fields that map to semantic
  scene events. `List.Dropdown` and `Grid.Dropdown` are accepted
  interchangeably as search-bar accessories, matching Raycast's shared
  dropdown contract.
- Clipboard `read`/`readText` decode the official structured `{ text }` shape,
  plain string responses, and empty responses; `clear` and `clearClipboard`
  use the explicit clipboard capability. `ActionPanel.Submenu` carries its
  search/open lifecycle and deprecated `id`, while `Action` preserves its
  deprecated `id` and `Action.InstallMCPServer` is brokered.
- The adapter now exposes the declaration-shaped nested `Props` namespaces
  for the measured `Action`, `ActionPanel`, `List`, `Grid`, `Form`, and
  `MenuBarExtra` APIs. `Cache.subscribe` stays bound when passed to React
  external-store hooks, and nullable `Form.TextArea.enableMarkdown` is omitted
  instead of crossing the scene boundary as `null`.
- The declaration surface now also exposes Raycast's `Alert.Options` and
  `Alert.ActionOptions`, `Cache.Options`/`Subscriber`/`Subscription`,
  `Keyboard.Shortcut`/`KeyModifier`/`KeyEquivalent`,
  `Toast.Options`/`ActionOptions`/`Style`, and `Form.ItemReference` aliases;
  `FormItemRef` is available as a top-level type. The nested Form field ref
  aliases and `Form.DatePicker.Type` are declaration-compatible, and deprecated
  Form field values retain their nested static members. `Toast.Style` constants
  use Raycast's uppercase values and normalize to lower-case scene styles. Form
  fields attach stable `focus()`/`reset()` handles; those methods are currently
  no-ops until a host-facing control boundary is defined.
- The measured collection-value boundary now preserves empty Grid content
  tooltips, accepts positive safe-integer Grid column counts, and serializes
  `List.Item` icon descriptors with optional values and tooltips. Pagination
  preserves non-negative safe-integer page sizes, including the zero fallback
  emitted by async hooks before pagination state is initialized. The explicit
  icon subset includes the observed `Icon.AddPerson` member. JSX conditional
  numeric `0` sentinels and React memo/forward-ref/lazy composites are accepted
  in measured collection slots. Optional string-array Form initial values omit
  only `undefined` entries when all remaining entries are strings; null and
  other invalid members remain rejected.
- Measured collection components accept custom function components, React
  fragments, and React context providers/consumers in action, list, grid,
  menu-bar, and form child positions; the resolved children remain subject to
  semantic parent/child validation, while raw text and intrinsic DOM elements
  remain unsupported.
- ActionPanel renders as a scene action-group (titles, submenus, List-level
  panels), and object icons with Color tints serialize into iconTintColor
  properties.
- Form renders the measured text, textarea, password, checkbox, dropdown,
  `DatePicker`, `TagPicker`, `FilePicker`, description, separator, and
  submit-action subset. Form field changes and submissions carry validated
  string, boolean, null, or string-array wire values through `scene.event`;
  `DatePicker` ISO strings are restored to native `Date | null` values by the
  adapter, and `ActionPanel.Section` publishes nested action groups.
- Toasts support legacy show calls plus identified show/update/hide lifecycle
  messages, animated/success/failure styles, mutable fields, and primary or
  secondary actions addressed by validated `scene.event` IDs.
- Action and action-group shortcut objects normalize into structured scene
  values, including platform-specific Raycast shortcut unions; measured action
  styles, `autoFocus`, and common keyboard shortcut constants are available.
- `SubmitFormAction`, `OpenAction`, `OpenWithAction`, and `PasteAction` preserve
  the measured form-submit and action shapes. `ImageMask` aliases `Image.Mask`,
  while the top-level clipboard and LocalStorage helpers route to the same
  brokered operations. `ListSection` maps to a semantic list-section node, and
  legacy `render(<Command />)` calls bridge into the active renderer.
- Legacy `preferences` exposes resolved manifest values through the official
  `.value` metadata shape, `FormValue` includes the pinned numeric forms, and
  `Navigation`, `Environment`, `KeyEquivalent`, `FormValues`,
  `KeyboardShortcut`, and `ImageLike` aliases are available. Environment
  `canAccess` is deny-by-default until host permission state is connected.
- `showHUD`, `open`, and `confirmAlert` cross explicit `hud.show`, `open.open`,
  and `alert.confirm` capability requests; alert callbacks run only after a
  validated boolean response.
- `Cache` provides synchronous namespaced UTF-8 LRU behavior as a session-local
  fallback. Its persistence-shaped `storageDirectory` remains a compatibility
  value until a host cache capability exists.
- `LaunchProps` and `LaunchType` are injected into Raycast-style default command
  components, with deterministic user-initiated/empty-argument defaults;
  `Image.Mask` constants resolve through the adapter.
- `closeMainWindow`, `popToRoot`, and `openExtensionPreferences` cross explicit
  `window.close`, `navigation.popToRoot`, and `preferences.openExtension`
  capability requests.
- `Grid` renders content tiles, sections, empty views, search-bar dropdowns,
  and measured layout props through a semantic grid scene root. `MenuBarExtra`
  renders menu-bar roots, items, sections, submenus, separators, shortcuts, and
  left-click action events. `MenuBarExtra.Item.alternate` renders a nested
  alternate item with a separate right-click event; menu-bar commands are
  included in corpus selection when no view command exists.
- `launchCommand` crosses an explicit `command.launch` capability. Command
  names, launch types, external targets, fallback text, and JSON-serializable
  arguments/context are validated before primitive-only wire encoding.
- `getSelectedText` and `getApplications` cross explicit `selection.read` and
  `application.list` capabilities. Selected text requires a string response;
  application results are JSON-decoded and validated into the measured
  `Application` shape, with an optional path encoded as a primitive argument.
- `openCommandPreferences` crosses the explicit
  `preferences.openCommand` capability.
- `getSelectedFinderItems` and `showInFinder` cross explicit
  `finder.selectedItems` and `finder.show` capabilities. Selected items are
  JSON-decoded into validated `FileSystemItem` paths, and reveal paths use the
  structural `PathLike` type.
- `getFrontmostApplication` crosses `application.frontmost` and reuses the
  validated `Application` response shape.
- `BrowserExtension.getTabs` and `BrowserExtension.getContent` cross explicit
  `browser-extension.getTabs` and `browser-extension.getContent` capabilities;
  tab responses are JSON-decoded and validated, while content format,
  selector, and tab ID options are normalized before crossing the boundary.
- `clearSearchBar` and `trash` cross explicit `navigation.clearSearchBar` and
  `filesystem.trash` capabilities. Trash accepts one or many structural
  `PathLike` values and encodes only normalized primitive paths; browser,
  navigation, and destructive filesystem behavior remains host-owned.
- The top-level `ToastStyle` constants preserve Raycast's uppercase legacy
  values, and `Tool.Confirmation<T>` is available as a type-only contract;
  neither introduces an unbrokered runtime capability.
- `OpenInBrowserAction` and `Action.OpenInBrowser` share a validated scene
  action and cross `open.open`; `CopyToClipboardAction` and
  `Action.CopyToClipboard` support string, numeric, and structured content with
  `clipboard.write` normalization. `Action.Open`/`OpenAction` and
  `Action.Paste`/`PasteAction` use `open.open` and `clipboard.paste`; the
  deprecated clipboard helper aliases share those operations. `getDefaultApplication` crosses
  `application.default`, `PreferenceValues` is type-only, and
  `captureException` crosses `telemetry.captureException` without making
  telemetry failures observable to the command.
- `AI.ask` crosses the explicit `ai.ask` capability. Prompt, creativity, and
  model options are validated and normalized; the returned promise preserves
  Raycast's `.on("data")` shape while the host owns the actual model provider.
- `OAuth.PKCEClient` covers the measured authorization-request, browser,
  token-set, and removal lifecycle through explicit `oauth.*` capabilities.
  PKCE material, browser interaction, and secure token storage remain host
  responsibilities.
- `updateCommandMetadata` crosses `command.updateMetadata` for the measured
  subtitle string and `null` clear semantics.

## Trust boundaries already enforced

- Received transport values remain `unknown` until validators accept them.
- Protocol and extension domain messages have separate validators.
- Shared List/Grid dropdown accessories remain within the semantic collection
  child whitelist in either direction; the adapter does not silently widen
  arbitrary collection composition.
- Optional form values on `scene.event` are validated as a field-ID map before
  the relay dispatches them to runtime callbacks; string arrays are checked
  element-by-element, while the compatibility adapter validates and restores
  date values.
- Top-level `null` initial values are normalized at the Raycast adapter edge for
  non-date controls; null members inside array-valued controls remain rejected
  before they reach the scene contract.
- Finder and trash action paths are normalized to primitive strings before they
  reach the host; the host still owns filesystem policy, authorization, and
  destructive-operation consent.
- String-valued dropdown labels, values, checkbox labels, and descriptions are
  type-checked without imposing an extra non-empty constraint; scene-required
  properties remain present even when their string value is empty.
- Toast lifecycle operations, toast IDs, styles, and action event IDs are
  validated before the relay forwards them to the client-side toast sink.
- Browser tab responses are JSON-decoded and validated before they reach an
  extension; filesystem trash paths are normalized to primitive strings before
  the host receives them.
- A runtime must identify as `extension-runtime`; a host must identify as
  `extension-host`.
- The runtime cannot choose which descriptor it runs, and a client cannot choose
  filesystem paths through the core API.
- Node processes are launched without a shell, and environment inheritance must
  be explicit.
- Standard output is reserved for protocol frames.

## Intentionally missing

- a persistent, watched catalog index and extension installation flows;
- full dependency provisioning beyond the eight bounded e2e seeds, lockfile/audit
  policy for large npm graphs, and native package externalization (the runtime
  supports explicit local or vendored dependency roots but never installs
  packages);
- the remaining measured Raycast surface: client toast timing/stacking, broader
  desktop APIs, broader action helpers, and additional Tool/browser APIs;
- a client-facing core protocol, daemon listener, and desktop rendering of
  scenes (the deterministic test client stands in today);
- capability manifest declarations, real operating-system providers, audit
  records, and consent UI;
- production AI providers, OAuth browser/token-store providers, and command
  metadata client integration; deterministic providers currently exist only
  for compatibility probes and fixtures;
- structured logs beyond captured child stderr;
- startup deadlines chosen by the core, restart policy, quotas, and OS sandbox;
- authenticated local sockets, WebSocket transport, and remote pairing;
- Electron V2 integration, CLI control, mobile, and web clients.

## Recommended continuation

The first extension-to-client vertical slice is complete, the corpus census
(`compatibility/README.md`) justified the adapter order, and the current
support matrix (`compatibility/support-matrix.md`) records the baseline and
post-slice probes. Coverage means the share of corpus extensions that bundle
and render through the current path, not the number of exported API names. The
shortcut, imperative, cache, launch-boundary, desktop-discovery,
finder-boundary, host-boundary, window-management, declaration, and
dependency-policy slices are complete, but the measured 80% target is not yet
met: the current run is 61.28% overall and 67.92% among commands with a
renderable selection. The current top-level import census and emitted
declaration audit are clean for the measured corpus surface, so priority has
shifted back to the remaining measured dependency and runtime outcomes while
preserving strict API boundaries. Additional bounded seeds remain acceptable
when diagnostics justify a small pure or policy-neutral group; network,
cross-extension, native, and WASM packages still require explicit decisions.

1. Use the corpus diagnostics to alternate between measured runtime/API gaps
   and small exact-version dependency seeds. The current top-level API import
   and declaration audits are clean, but compatibility remains limited by
   dependency and process outcomes. Keep implementing only runtime values and
   host capabilities that can be validated safely, and preserve structured
   errors for values that would require a broader scene or host policy. Keep
   the deterministic structured probe failure
   (`open-targets-raycast/platform`) as an explicit diagnostic rather than
   weakening the scene or action validators around malformed children, invalid
   measured values, and empty or missing targets. The latest aggregate recorded
   no structured errors; the focused reprobe remains a strict boundary check.
   The targeted
   `modrinth-search/search-projects` reprobe renders
   after preserving its declaration-shaped zero page-size fallback, and the
   four targeted OpenInBrowser commands render after the action-readiness
   boundary was added; later full-run changes remain subject to process and
   dependency variance.
2. Keep the command-scoped preference, nullable Form, empty-string,
   `LocalStorage.allItems`/`allLocalStorageItems`, Form event, literal `require`,
   composite-child/context-provider, declaration-backed Icon,
   cross-compatible dropdowns,
   `ActionPanel.Item`, whitespace-only
   collection boundaries, `Form.LinkAccessory`, the measured action creators,
   Finder/trash actions, collection-value normalization, CreateSnippet and
   Quick Look actions, Detail metadata, `List.Item.Detail`, search/pagination
   events, zero pagination and OpenInBrowser readiness fallbacks, Clipboard
   read/clear, Submenu lifecycle,
   nested `Props` and utility namespaces, `Form.ItemReference`,
   and deprecated Form/action member aliases covered by each reprobe.
3. Keep safe dynamic, namespace, side-effect, and literal `require` import
   forms covered while the remaining `fetch` import stays outside the adapter
   until a host network capability defines URL policy, consent, and response
   limits.
4. Continue small, exact-version, development-only dependency seeds when the
   diagnostic census supports them. Keep each group reviewable and measure
   rendered outcomes after installation; hold network, cross-extension,
   native, and WASM packages for explicit policy decisions.
5. Add a client-facing core protocol and daemon listener so the Electron
   client can replace the test client after the coverage boundary is stable.

Keep WebSocket and remote execution as transport/provider additions. They do not
require changing the session, extension contract, runtime, host, or core
ownership boundaries established here.
