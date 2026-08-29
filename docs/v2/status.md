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
  event identifiers for action and form-control callbacks.
- The Raycast compatibility adapter implements the census-measured view
  stack (List, List.Item, ActionPanel, Action, Detail, Form, Icon) over the
  renderer, routes Clipboard through the capability broker, and raises
  structured errors for unmeasured surface; a Raycast-style fixture
  extension runs end to end over child processes.
- The Node bootstrap bundles entrypoints with esbuild (TypeScript/JSX and
  literal `@raycast/api` imports resolved by launcher-provided aliases) and
  renders default-exported command components through the adapter, so
  unmodified Raycast-style TSX fixtures run end to end. Default temporary
  bundle directories are removed after each successful or failed load; an
  explicitly supplied cache directory remains caller-owned.
- The support matrix runs a committed set of real corpus extensions through
  the full pipeline in CI: twenty-one render fixtures (list, detail, navigation,
  action groups, tinted icons, form controls, toasts, preferences, brokered
  clipboard, and desktop boundaries) and one fails with a structured
  `unsupported_api` error, while the corpus probe records exactly which
  unmeasured APIs block the rest.
- Navigation (useNavigation, Action.Push), LocalStorage through the
  capability broker with a reference in-memory provider, and environment()
  are measured adapter surface; pushed views stay mounted so state survives
  popping, and only the top view contributes scene nodes.
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
  left-click action events; menu-bar commands are included in corpus selection
  when no view command exists.
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
- Optional form values on `scene.event` are validated as a field-ID map before
  the relay dispatches them to runtime callbacks; string arrays are checked
  element-by-element, while the compatibility adapter validates and restores
  date values.
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
- full dependency provisioning, lockfile/audit policy, and native package
  externalization for large npm graphs (the runtime now supports explicit
  local or vendored dependency roots but never installs packages);
- the remaining measured Raycast surface: Form focus/blur callbacks, client
  toast timing/stacking, broader desktop APIs such as default-application
  discovery, broader action helpers, and additional Tool/browser APIs;
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
post-slice probes. The priority remains measured extension coverage: coverage
means the share of corpus extensions that bundle and render through the current
path, not the number of exported API names. The shortcut, imperative, cache,
launch-boundary, desktop-discovery, finder-boundary, host-boundary, and
dependency-policy slices are complete, but the measured 80% target is not yet
met; the next work should address the dominant remaining API and dependency
blockers using the same probe.

1. Expand the next measured blocker group (`captureException`,
   `OpenInBrowserAction`, `CopyToClipboardAction`, `getDefaultApplication`,
   and `PreferenceValues`) with measured call/return shapes and explicit
   compatibility or capability boundaries.
2. Provision an audited, pinned vendor set or an explicit installation phase
   for the remaining third-party dependency graph; keep installation outside
   extension execution.
3. Re-probe after each group and update the support matrix against the 80%
   extension-pass milestone.
4. Add a client-facing core protocol and daemon listener so the Electron
   client can replace the test client after the coverage boundary is stable.

Keep WebSocket and remote execution as transport/provider additions. They do not
require changing the session, extension contract, runtime, host, or core
ownership boundaries established here.
