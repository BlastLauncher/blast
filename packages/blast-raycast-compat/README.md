# `@blastlauncher/raycast-compat`

Measured Raycast API compatibility adapter for Blast V2 (ADR 0011).

The package maps the census-justified subset of the `@raycast/api` surface
onto the V2 scene contract, renderer, and capability broker:

- `List`, `List.Item`, `List.Section`, `List.EmptyView`, `List.Dropdown`,
  `ListSection`, `ActionPanel`,
  `ActionPanel.Item`, `Action`,
  `Action.CopyToClipboard`, `Action.Open`, `Action.OpenInBrowser`,
  `Action.OpenWith`, `Action.Paste`, `Action.Push`, `Action.CreateQuicklink`,
  `Action.CreateSnippet`, `Action.ToggleQuickLook`, `Action.PickDate`,
  `Action.ShowInFinder`, `Action.Trash`, and
  `Action.SubmitForm`,
  plus the deprecated `ActionPanelItem`, `CopyToClipboardAction`,
  `OpenAction`, `OpenInBrowserAction`, `OpenWithAction`, `PasteAction`,
  `PushAction`, `ShowInFinderAction`, `TrashAction`, and `SubmitFormAction`
  aliases, render through
  `@blastlauncher/react-renderer`. List item IDs, keywords, accessories,
  icon/text tooltips, Quick Look metadata, filtering, selection/search events,
  and pagination are serialized into the scene contract;
- `Grid` covers content tiles, sections, empty views, search-bar dropdowns,
  item actions, integer column counts from one through eight, empty content tooltips,
  layout constants, Quick Look metadata, filtering, pagination, and
  selection/search callbacks. Pagination preserves the declaration-shaped
  non-negative safe-integer `pageSize`, including the zero fallback emitted by
  async hooks before their pagination state is initialized. `List.Dropdown`
  and `Grid.Dropdown` are accepted
  interchangeably as search-bar accessories;
  `MenuBarExtra`
  covers menu-bar roots, items, sections, submenus, separators, shortcuts, and
  left-click callbacks. `MenuBarExtra.Item.alternate` publishes a nested
  alternate item and routes its callback as a right-click event;
- `Detail` and `List.Item.Detail` serialize measured labels, separators, links,
  tag lists, loading state, navigation titles, and list detail selection as
  explicit scene data. List title/subtitle tooltip descriptors are preserved;
  the measured corpus usage of `Action.SubmitForm` outside `Form` is
  supported as a generic action whose callback receives an empty value bag.
  `Action.OpenInBrowser` preserves declaration-valid empty string URLs while an
  async command is loading and omits the action when its required URL is
  absent; host opening still validates the target when the action is activated.
- The deprecated top-level `ListItem` alias preserves `List.Item` identity.
- `Form` covers text fields, text areas, password fields, checkboxes,
  dropdowns, date pickers, tag pickers, file pickers, descriptions, separators,
  dropdown sections/items, tag items, deprecated direct dropdown/tag-item
  aliases, and `searchBarAccessory` via
  `Form.LinkAccessory`. Link accessories serialize as semantic nodes and route
  their open event through the existing `open` capability. Field `onFocus` and `onBlur`
  callbacks receive the measured `Form.Event` target shape, and custom React
  components/fragments may compose measured field and action children.
  Whitespace-only formatting text is ignored in measured collection slots, while
  meaningful text remains unsupported;
- `Icon` mirrors all 478 members of the pinned Raycast declaration in one
  explicit enum-like object, including numbered, progress, disabled, and
  formatting variants. Legacy corpus names remain available; unknown members
  stay unsupported rather than resolving through an implicit fallback.
  `Color` exposes theme-aware `raycast-*` values while retaining legacy
  `Pink`/`Brown` aliases. Object/file/theme-aware icon descriptors are
  validated at the adapter edge; source/fallback variants, masks, dynamic
  tint metadata, and List item icon tooltips cross the semantic boundary while
  client image transforms remain host work;
- `Clipboard.copy`/`Clipboard.paste`/`Clipboard.read`/`Clipboard.readText`/
  `Clipboard.clear` route through the capability broker with the command
  identity attached by the host; text, numeric, and structured clipboard
  content are normalized across the primitive-only boundary, with deprecated
  `copyTextToClipboard`, `pasteText`, and `clearClipboard` aliases;
- action and toast-action shortcut unions normalize into structured scene
  values; action styles, `autoFocus`, `Keyboard.Shortcut.Common`, and the
  measured `Alert`/`Action` constants are available;
- `ActionPanel.Submenu` supports the declaration-backed `id`, filtering,
  loading, throttled search, and lazy `onOpen` lifecycle; `Action` preserves
  its deprecated `id`, and `Action.InstallMCPServer` routes validated server
  definitions through `mcp-server.install`;
- `showHUD`, `open`, and `confirmAlert` route through `hud.show`, `open.open`,
  and `alert.confirm` capability requests;
- default-exported command components receive `LaunchProps` with a
  user-initiated launch and empty arguments by default; `LaunchType`,
  `Image.Mask`, and the deprecated `ImageMask` value/type are available;
- `environment` exposes the measured Raycast property object and retains a
  callable compatibility form for older Blast fixtures. Its `entryPointMode`
  and deprecated `commandMode` values preserve trusted manifest `view`,
  `no-view`, and `menu-bar` modes, defaulting to `view` for legacy contexts;
  `canAccess` delegates to an optional host policy with default denial and
  stable names for measured API tokens; `preferences` exposes resolved
  manifest values through legacy preference metadata, and `randomId` provides
  process-local unique IDs;
- the official type-only aliases `Environment`, `Navigation`, `Preferences`,
  `Preference`, `ArgumentsLaunchProps`, `FormItemRef`, `ItemProps`, `FormValue`,
  `FormValues`, `KeyEquivalent`, `KeyboardShortcut`, and `ImageLike` are
  available;
- `closeMainWindow`, `popToRoot`, and `openExtensionPreferences` route through
  `window.close`, `navigation.popToRoot`, and `preferences.openExtension`
  capability requests;
- `getSelectedText` and `getApplications` route through `selection.read` and
  `application.list`; the latter validates a JSON-encoded `Application[]`
  response and accepts an optional path argument;
- `getSelectedFinderItems` and `showInFinder` route through the `finder`
  capability; selected items are validated as JSON-encoded `FileSystemItem[]`
  values and reveal paths accept the structural `PathLike` type;
- `Action.ShowInFinder`/`ShowInFinderAction` and
  `Action.Trash`/`TrashAction` route normalized `PathLike` values through the
  existing `finder.show` and `filesystem.trash` capabilities; completion
  callbacks run after a successful host response;
- `Action.CreateSnippet` routes a strictly serialized `{ text, name?, keyword? }`
  payload through `snippet.create`, and `Action.ToggleQuickLook` routes the
  selected item's preview toggle through `quick-look.toggle`;
- `getFrontmostApplication` routes through `application.frontmost` and
  validates the shared JSON-encoded `Application` shape;
- `getDefaultApplication` routes through `application.default`, validates the
  shared JSON-encoded `Application` shape, and accepts structural `PathLike`
  values; `PreferenceValues` is available as a type-only preference bag;
- `WindowManagement.getActiveWindow`, `getWindowsOnActiveDesktop`, and
  `getDesktops` route through the explicit `window-management` capability and
  validate JSON-encoded desktop/window results; `setWindowBounds` validates
  JSON-encodable bounds options before brokered host mutation;
- `LocalStorage.allItems` returns the complete extension-local key/value object
  through the identity-scoped capability boundary, and the deprecated
  `allLocalStorageItems` alias shares that implementation with the existing
  `getLocalStorageItem`, `setLocalStorageItem`, `removeLocalStorageItem`, and
  `clearLocalStorage` aliases;
- `BrowserExtension.getTabs` and `BrowserExtension.getContent` route through
  host-owned browser-extension capabilities; tab responses are validated and
  content options are normalized before crossing the primitive boundary,
  including Raycast's restriction against combining a CSS selector with
  markdown content;
- `clearSearchBar` and `trash` route through host-owned navigation and
  filesystem capabilities. `trash` accepts one or many structural `PathLike`
  values and sends normalized paths as JSON;
- `captureException` reports a normalized exception payload through
  `telemetry.captureException` without making telemetry availability affect
  command execution; `captureMemorySnapshot` follows the same best-effort
  telemetry boundary;
- `Action.Open`/`OpenAction`, `Action.OpenWith`/`OpenWithAction`, and
  `Action.Paste`/`PasteAction` route open and paste actions through host
  capabilities and invoke their completion callbacks. `render` bridges
  legacy `render(<Command />)` entrypoints into the active scene renderer;
- `Action.CreateQuicklink` validates a Quicklink and routes it through
  `quicklink.create`; `Action.PickDate` routes validated picker options through
  `date-picker.pick` and restores the host's ISO result to `Date | null`.
  Native providers and consent policy remain host responsibilities;
- `Action.Push` and `PushAction` accept measured React-element targets, route
  navigation through the runtime stack, and invoke `onPush`/`onPop` callbacks;
  the navigation proxy is shared through the command realm so bundled
  `@raycast/api` copies can reach the bootstrap-owned stack;
- the legacy top-level `ToastStyle` constants retain Raycast's uppercase
  values, while `Tool.Confirmation<T>` is exposed as a type-only contract;
- `AI.ask` routes through `ai.ask`, validates creativity/model options, and
  preserves the promise's measured `.on("data")` completion shape;
- `OAuth.PKCEClient` routes authorization requests, browser authorization, and
  token-set lifecycle operations through explicit host-owned `oauth.*`
  capabilities;
- `updateCommandMetadata` routes measured subtitle updates and `null` clears
  through `command.updateMetadata`;
- `openCommandPreferences` routes through `preferences.openCommand`;
- `launchCommand` routes through `command.launch`. Object arguments and context
  are validated as JSON and encoded as `argumentsJSON`/`contextJSON` strings on
  the primitive-only capability boundary; resolving and starting the target
  command remains host/client work;
- `Cache` provides synchronous namespaced LRU semantics in a session-local
  fallback, including a bound `subscribe` method for React external-store
  hooks; persistence is intentionally a future host capability;
- Declaration-shaped nested `Props` namespaces are available for the measured
  `Action`, `ActionPanel`, `List`, `Grid`, `Form`, and `MenuBarExtra` members so
  existing Raycast TypeScript code retains its public typing surface. The
  utility namespaces `Alert`, `Cache`, `Keyboard`, and `Toast` expose their
  declaration-shaped option/style/shortcut aliases, and `Form.ItemReference`
  plus `FormItemRef` are available for type consumers. The nested Form field
  ref aliases (`Form.TextField`, `Form.DatePicker`, `Form.Dropdown`, and the
  other measured fields) and `Form.DatePicker.Type` are also declaration
  compatible; deprecated Form field values retain their nested static
  members. Form fields attach stable `focus()`/`reset()` handles; their
  client-side control behavior remains a future host boundary;
- `showToast` and `Toast` support legacy show overloads, animated/success/
  failure styles, Raycast's uppercase `Toast.Style` constants, identified
  show/update/hide lifecycle messages, mutable toast fields, and
  primary/secondary actions routed through scene events;
- `runCommand(context, component[, launchProps])` binds the API to the running
  command, injects launch props, and routes scene events back to component
  callbacks; the Node bootstrap's
  `configureApi` hook calls `configureRaycastCompat` before the command runs.

Measured collection components accept custom function components and React
fragments in action, list, grid, menu-bar, and form child positions. Their
resolved scene children are still checked against the semantic parent/child
contract; raw text and intrinsic DOM elements remain unsupported. React
memo/forward-ref/lazy wrappers are treated as composites, and exact numeric
`0` conditional children are ignored.

List and Grid `quickLook` item metadata is validated at the adapter edge:
paths cross as normalized primitive strings and an optional preview name is
preserved in the scene. Native Quick Look presentation and selection remain
client responsibilities.

Form changes and submissions use validated `scene.event` values. The adapter
keeps uncontrolled defaults and client-provided values together and filters
submitted values to the current form field IDs. `DatePicker` values are native
`Date | null` values in the adapter and ISO strings on the scene wire;
`TagPicker` and `FilePicker` values are string arrays (file values are paths).
At runtime, a top-level `null` initial value on a non-date control is treated as
an empty/omitted initial value for nullable async state; invalid array members
and other wrong types remain structured compatibility errors.
Optional string-array initial values omit `undefined` entries only when all
remaining entries are strings; null members and other invalid entries remain
rejected.
String-valued Form and Grid dropdown labels and values preserve empty strings;
non-string values remain structured compatibility errors.
The public `FormValue` union also includes numeric and numeric-array values from
the pinned Raycast declaration; the currently measured scene controls remain
the string, boolean, date, and string-array subset.

Literal dynamic imports, namespace imports, side-effect imports, and literal
CommonJS `require("@raycast/api")` calls resolve through the same launcher alias
as named imports. The adapter only promises the measured exported members;
network-style `fetch` access remains outside the compatibility surface until a
host capability and policy are defined.

## Compatibility boundary

Unmeasured surface (client toast timing/stacking, broader desktop APIs, and
broader action/browser/Tool helpers) raises a
structured `CompatibilityError` with code `unsupported_api`; it never fails
silently. Menu-bar alternate presentation remains a client responsibility,
but alternate item identity and right-click event semantics are represented in
the scene boundary. Pagination rejects negative, fractional, and unsafe page
sizes while preserving zero. The AI, OAuth, selected-text,
application-list, command-preference, Finder, frontmost-application,
browser-extension, navigation, and filesystem capabilities still need
production host providers, secure integration, and consent policy. Resolution
of literal `@raycast/api` imports to this adapter happens at the runtime layer
when extension bundling lands.

## Boundaries

The adapter depends only on React, the scene contract, and the React
renderer. It must not depend on core, hosts, transports, Node-only APIs, or
Electron. The application, browser, clipboard, filesystem, and telemetry
providers remain host responsibilities.
