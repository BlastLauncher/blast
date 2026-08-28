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
  unmodified Raycast-style TSX fixtures run end to end.
- The support matrix runs a committed set of real corpus extensions through
  the full pipeline in CI: fifteen render fixtures (list, detail, navigation,
  action groups, tinted icons, form controls, toasts, preferences, and
  brokered clipboard) and one fails with a structured `unsupported_api`
  error, while the corpus probe records exactly which unmeasured APIs block
  the rest.
- Navigation (useNavigation, Action.Push), LocalStorage through the
  capability broker with a reference in-memory provider, and environment()
  are measured adapter surface; pushed views stay mounted so state survives
  popping, and only the top view contributes scene nodes.
- ActionPanel renders as a scene action-group (titles, submenus, List-level
  panels), and object icons with Color tints serialize into iconTintColor
  properties.
- Form renders the measured text, textarea, password, checkbox, dropdown,
  description, separator, and submit-action subset. Form field changes and
  submissions carry validated string, boolean, or null values through
  `scene.event`, and `ActionPanel.Section` publishes nested action groups.

## Trust boundaries already enforced

- Received transport values remain `unknown` until validators accept them.
- Protocol and extension domain messages have separate validators.
- Optional form values on `scene.event` are validated as a field-ID map before
  the relay dispatches them to runtime callbacks.
- A runtime must identify as `extension-runtime`; a host must identify as
  `extension-host`.
- The runtime cannot choose which descriptor it runs, and a client cannot choose
  filesystem paths through the core API.
- Node processes are launched without a shell, and environment inheritance must
  be explicit.
- Standard output is reserved for protocol frames.

## Intentionally missing

- a persistent, watched catalog index and extension installation flows;
- production bundle cache invalidation and externalization policy for
  extensions with large or native npm dependency graphs;
- the remaining measured Raycast surface: richer Form controls
  (`DatePicker`, `TagPicker`, `FilePicker`, focus/blur callbacks), toast
  display semantics, shortcut objects, and `Cache`;
- a client-facing core protocol, daemon listener, and desktop rendering of
  scenes (the deterministic test client stands in today);
- capability manifest declarations, real operating-system providers, audit
  records, and consent UI;
- structured logs beyond captured child stderr;
- startup deadlines chosen by the core, restart policy, quotas, and OS sandbox;
- authenticated local sockets, WebSocket transport, and remote pairing;
- Electron V2 integration, CLI control, mobile, and web clients.

## Recommended continuation

The first extension-to-client vertical slice is complete, the corpus census
(`compatibility/README.md`) justifies the adapter order, the first measured
adapter surface runs end to end, bundled TSX extensions with literal
`@raycast/api` imports load, and the support matrix (`compatibility/support-matrix.md`)
runs real corpus fixtures in CI. Continue with the compatibility phase:

1. extend the measured surface in matrix order: toast display semantics,
   richer Form controls, and shortcut objects;
2. add third-party dependency policy (vendoring or installation) so
   dependency-using corpus extensions can bundle;
3. add a client-facing core protocol and daemon listener so the Electron
   client can replace the test client.

Keep WebSocket and remote execution as transport/provider additions. They do not
require changing the session, extension contract, runtime, host, or core
ownership boundaries established here.
