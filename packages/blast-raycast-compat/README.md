# `@blastlauncher/raycast-compat`

Measured Raycast API compatibility adapter for Blast V2 (ADR 0011).

The package maps the census-justified subset of the `@raycast/api` surface
onto the V2 scene contract, renderer, and capability broker:

- `List`, `List.Item`, `List.Section`, `ListSection`, `ActionPanel`, `Action`,
  `Action.CopyToClipboard`, `Action.Open`, `Action.OpenInBrowser`,
  `Action.OpenWith`, `Action.Paste`, `Action.Push`, and `Action.SubmitForm`,
  plus the deprecated `ActionPanelItem`, `CopyToClipboardAction`,
  `OpenAction`, `OpenInBrowserAction`, `OpenWithAction`, `PasteAction`,
  `PushAction`, and `SubmitFormAction` aliases, render through
  `@blastlauncher/react-renderer`;
- `Grid` covers content tiles, sections, empty views, search-bar dropdowns,
  item actions, layout constants, and selection/search callbacks; `MenuBarExtra`
  covers menu-bar roots, items, sections, submenus, separators, shortcuts, and
  left-click callbacks;
- `Form` covers text fields, text areas, password fields, checkboxes,
  dropdowns, date pickers, tag pickers, file pickers, descriptions, separators,
  dropdown sections/items, and tag items;
- `Icon` ships a measured kebab-case subset serialized into scene `icon`
  properties, including object-icon tint colors;
- `Clipboard.copy`/`Clipboard.paste`/`Clipboard.read` route through the
  capability broker with the command identity attached by the host; text,
  numeric, and structured clipboard content are normalized across the
  primitive-only boundary, with deprecated `copyTextToClipboard` and `pasteText`
  aliases;
- action and toast-action shortcut unions normalize into structured scene
  values; action styles, `autoFocus`, `Keyboard.Shortcut.Common`, and the
  measured `Alert`/`Action` constants are available;
- `showHUD`, `open`, and `confirmAlert` route through `hud.show`, `open.open`,
  and `alert.confirm` capability requests;
- default-exported command components receive `LaunchProps` with a
  user-initiated launch and empty arguments by default; `LaunchType`,
  `Image.Mask`, and the deprecated `ImageMask` value/type are available;
- `environment` exposes the measured Raycast property object and retains a
  callable compatibility form for older Blast fixtures; `preferences` exposes
  resolved manifest values through legacy preference metadata, and
  `randomId` provides process-local unique IDs;
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
  content options are normalized before crossing the primitive boundary;
- `clearSearchBar` and `trash` route through host-owned navigation and
  filesystem capabilities. `trash` accepts one or many structural `PathLike`
  values and sends normalized paths as JSON;
- `captureException` reports a normalized exception payload through
  `telemetry.captureException` without making telemetry availability affect
  command execution;
- `Action.Open`/`OpenAction`, `Action.OpenWith`/`OpenWithAction`, and
  `Action.Paste`/`PasteAction` route open and paste actions through host
  capabilities and invoke their completion callbacks. `render` bridges
  legacy `render(<Command />)` entrypoints into the active scene renderer;
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
  fallback; persistence is intentionally a future host capability;
- `showToast` and `Toast` support legacy show overloads, animated/success/
  failure styles, identified show/update/hide lifecycle messages, mutable
  toast fields, and primary/secondary actions routed through scene events;
- `runCommand(context, component[, launchProps])` binds the API to the running
  command, injects launch props, and routes scene events back to component
  callbacks; the Node bootstrap's
  `configureApi` hook calls `configureRaycastCompat` before the command runs.

Form changes and submissions use validated `scene.event` values. The adapter
keeps uncontrolled defaults and client-provided values together and filters
submitted values to the current form field IDs. `DatePicker` values are native
`Date | null` values in the adapter and ISO strings on the scene wire;
`TagPicker` and `FilePicker` values are string arrays (file values are paths).
The public `FormValue` union also includes numeric and numeric-array values from
the pinned Raycast declaration; the currently measured scene controls remain
the string, boolean, date, and string-array subset.

Literal dynamic imports, namespace imports, and side-effect imports of
`@raycast/api` resolve through the same launcher alias as named imports. The
adapter only promises the measured exported members; network-style `fetch`
access remains outside the compatibility surface until a host capability and
policy are defined.

## Compatibility boundary

Unmeasured surface (client toast timing/stacking, focus/blur form callbacks,
broader desktop APIs, and broader action/browser/Tool helpers) raises a
structured `CompatibilityError` with code `unsupported_api`; it never fails
silently. Menu-bar alternate items and right-click event identity remain
outside the current scene boundary. The AI, OAuth, selected-text,
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
