# Architecture

Current shape only; history lives in git. Decisions: `docs/decisions/`.
```
client (embedder UI; reference clients: headless CLI, OpenTUI terminal)
   │  scene → view model, events, timing rules  (packages/client-core)
   │  in-process API or NDJSON stdio (packages/serve)
host ── bundles extension (esbuild), spawns runtime, capability broker
   │  NDJSON over stdio  (packages/protocol)
runtime (one Node process per command or provider)
   ├─ React reconciler → scene snapshots
   └─ @raycast/api shim → capability requests for privileged calls
extension code (unmodified, bundled)
```

## Packages

| Package                | Owns                                                                                                                          | Depends on                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `packages/protocol`    | message types, validation, NDJSON framing                                                                                     | nothing                                  |
| `packages/runtime`     | reconciler, `@raycast/api` shim, child entry                                                                                  | protocol, react                          |
| `packages/serve`       | versioned embedder stdio, capability forwarding                                                                               | host, protocol, native                   |
| `packages/host`        | engine: bundling, process lifecycle, broker, registry                                                                         | protocol, esbuild                        |
| `packages/client-core` | framework-free Raycast client semantics (view model, filtering, actions, shortcuts, pagination, dropdown, grid, form, timing) | protocol                                 |
| `packages/native`      | optional OS clipboard, open, file manager, trash                                                                              | protocol                                 |
| `packages/cli`         | `blast` debug CLI and headless capability answers                                                                             | host, protocol                           |
| `packages/tui`         | Bun terminal client (reference embedder)                                                                                      | client-core, cli, host, protocol, native |

`host` never imports `runtime` code; it only spawns its entry file.

## Message flow

1. host → `init` (protocol version, command, preferences, environment: identity,
   owner/author, paths, appearance, text size; the runtime derives `entryPoint*`
   from the command before importing it)
2. runtime → `ready`, then `scene` after every commit
3. host → `event` for user input (handler reference + args)
4. runtime → `capability.request` / `capability.cancel`; host → `capability.progress` / `capability.result`
5. host → `shutdown`, or the process exits/crashes and the host reports it

## Scene conventions

View commands have a `Navigation` root with ordered `Navigation.Entry` children.
Only the active entry exposes view contents and handlers; covered views stay
mounted. `Navigation.props.pop` requests back above depth one (decision 0003),
and `props.popToRoot` records the options of the latest `popToRoot()` call —
Blast has no client search-bar state, so `clearSearchBar` is a request for
clients. The standalone `clearSearchBar()` similarly records its options in
`Navigation.props.clearSearchBar`. `props.closeMainWindow` records the latest
`closeMainWindow()` request
(its options, or an empty object) the same way. Feedback children follow the
entries: `Toast`, `HUD`, and the first queued `Alert`, with action handlers on
`Toast.Action` / `Alert.Action` children (decision 0004). No-view commands mount
this scene only when showing feedback or closing the window. Promise-returning
view exports run to completion with feedback mounted (decision 0004).

Host element `type`s are the public Raycast paths: `List`, `List.Item`,
`List.Section`, `List.EmptyView`, `ActionPanel`, `ActionPanel.Section`,
`Action`, `Action.CopyToClipboard`, `Detail`, and the metadata views
(`Detail.Metadata.*`, `List.Item.Detail` with its `List.Item.Detail.Metadata.*`).

Element-valued props (`actions`, `detail`, …) cannot live inside a node's
serializable props, so the shim renders each one as a host child of type
`Slot` with `props: { name: "<propName>" }` wrapping the element:

```
List
├─ List.Item
│  ├─ Slot name="actions"  → ActionPanel → Action…
│  └─ Slot name="detail"   → List.Item.Detail …
└─ …
```

`Slot` is Blast-only; regular children come first, then the `Slot` children in
a stable order. Clients resolve a prop element by taking the `Slot` child with
the matching `name`.

Image-likes (`Image.ImageLike`), color-likes (`Color.ColorLike`) and shortcuts
(`Keyboard.Shortcut`) cross the wire exactly as authored: a string stays a
string, an `Icon` keeps its name, and an object keeps `source` (including the
`{ light, dark }` pair), `fallback`, `mask`, `tintColor` or `fileIcon` as
passed, `null` included. The shim never resolves an image or picks a platform,
so a shortcut keeps whichever of `{ modifiers, key }` or `{ macOS, Windows }`
the extension passed.

`environment` is fully populated before the extension is imported:
`appearance` (headless default `"dark"`), `textSize` (`"medium"`),
`ownerOrAuthorName` (`owner` ?? `author`), `entryPointName` /
`entryPointMode` from the launched command, `entryPointType` always
`"command"`. `canAccess(AI)` / `canAccess(BrowserExtension)` use the host-supplied
`init.environment.availableAPIs` list (absent means neither is available); other
implemented APIs are accessible and stubs are inaccessible.

## Host sessions

`createEngine({ dataDir?, installer?, handlers? })` groups extension handles:
`register(handlers)` returns unregister (later wins, future launches), and
`engine.openExtension` inherits its options; standalone `openExtension` works too.
Handlers resolve engine → extension → launch, then session storage, OAuth tokens
and own-provider AI win. Unregistered capabilities are denied (decision 0010).

`openExtension({ extensionDir, dataDir?, installer?, handlers? })` returns a handle:
`manifest()` (validated commands, arguments, preference schemas), `watch(listener)`
(debounced updates or errors; returns unsubscribe), serialized
`dependencies.check()` / `install({ onLog })`, `preferences(command)` (schemas,
values, missing required) and `savePreferences(command, values)` (scope split),
and `launch(command, { argumentValues?, handlers?, launchContext? })`, which waits
for installs, rejects missing values with `MissingLaunchValuesError` and returns
`{ session, close }`. `close()` ends watchers and all owned sessions.

`blast deps` keeps keyed production installs outside extensions under `<dataDir>/deps/`;
bundling resolves matching installs before the shared dependency allowlist.

`bundleCommand({ extensionDir, command, outDir?, dataDir? })` returns the entry path,
extension/command names, manifest mode and argument declarations. Pass those to
`startCommand({ ...bundled, argumentValues, launchContext, broker })`; the values
reach the command as its launch props. The host resolves
`@blastlauncher/runtime/main` and spawns an explicit Node binary (`nodePath`,
default `node`); it never imports runtime source.

`bundleModelProvider({ extensionDir, outDir? })` resolves `ai.modelProvider`
from the manifest. `startModelProvider({ ...bundled, preferences?, broker? })`
uses the same runtime lifecycle in `model-provider` mode, without rendering.
Its `getModels()` returns model metadata; `stream(model, request, { signal? })`
yields JSON stream parts. Attachment bytes, ArrayBuffers and URLs have explicit
wire encodings (decision 0006). Abort stops publication and iteration; shutdown
also terminates producers that do not cooperate. `blast models` and
`blast complete` expose this API. AI.ask with `{ id }` lazily starts the calling
extension's provider, reuses it until command exit and streams each text chunk.
AI.refreshModels re-lists that provider, or does nothing when none is declared.
Both own-extension operations need no grant (decision 0006).

Startup resolves after the version handshake. `session.scenes(callback)` subscribes
and replays the latest scene; its return value unsubscribes. `latestScene`, `logs`,
`sendEvent(node, handler, args)` and `exited` support headless clients. Runtime
errors appear in logs; fatal and protocol errors also appear in `exited.error`.
`shutdown({ timeoutMs })` sends shutdown, then SIGTERM after the timeout, then
SIGKILL after another timeout. Exit resolves after stdio closes.

Broker grants are explicit; missing handlers return `denied`, thrown handlers
return `failed`. Preferences and environment can be supplied at startup. The
build directory mirrors Raycast: `<outDir>/assets` links to
`<extensionDir>/assets` (a read-only copy where symlinks are unavailable), so
`environment.assetsPath` and `__dirname`-relative asset paths both resolve, and
`bundleCommand` returns the link as `assetsPath`. The extension directory is
never written. The host creates a stable support
directory at `<dataDir>/support/<escaped-extension>/` before spawning, using the
same data root as local storage; `--data-dir` applies to both. Callers can also
supply explicit environment paths. Synchronous `Cache` stores strings under
`<supportPath>/cache/<namespace?>` with atomic replacement and byte-based LRU
eviction. Subscriptions notify matching cache instances within the process.
Callers own bundle output directories (default: a unique directory below
`os.tmpdir()/blast/builds`) and remove them after sessions exit.

Capability semantics and storage locations are in `docs/capabilities.md`.

## Local storage

`LocalStorage` in the runtime is a capability client: `storage.get|set|remove|all|clear`
carry a key and a value — never an extension name, which the host takes from the
session. The host answers them with
`createStorageHandlers({ extensionName, dataDir })`: one JSON file per extension
at `<dataDir>/storage/<extension>.json` (default `<dataDir>`:
`$XDG_DATA_HOME/blast`). `blast run` installs those handlers for the session's
own extension by default — storage needs no `--grant` — and `--data-dir` moves
the root. Writes are atomic (temp file + rename) and serialized, and a store the
host cannot read fails the request rather than overwriting it.

Dropdowns use `storage.get|set` with scope `blast:internal` and keys prefixed
`blast:dropdown:` containing command name, component type and dropdown id
(`default` when omitted). The host stores this scope under `<dataDir>/internal/`,
separate from extension LocalStorage, so even identical keys cannot collide;
LocalStorage all/clear do not expose or erase dropdown choices. Controlled
values take precedence. Restoration validates options declared in children;
options hidden inside custom components are not yet discoverable.

## Forms

Form fields expose runtime-owned `value` and `onChange`; `Action.SubmitForm`
collects the mounted fields by id. Controlled fields follow their supplied
value; uncontrolled fields retain edits until unmount. Form actions use the
`actions` Slot. Picker options are carried in the scene; no OS dialog opens.
PasswordField keeps its value runtime-side: the scene carries a boolean
`hasValue` (never the value or its length), while `onChange`, focus/blur
events and submit deliver the raw value to the extension. Refs expose `focus()` (one `focused` scene field, ordered blur/focus events)
and `reset()` (default or empty value, with onChange). `storeValue` saves edits in
`blast:internal` under command/field keys; stored values override defaults,
controlled values win, and late reads cannot overwrite edits. Root `enableDrafts`
forms save command drafts, loaded into init before launch, restoring fields and
`LaunchProps.draftValues` (tagged ISO dates become Dates). Successful SubmitForm
clears drafts; failed submits retain them. Pushed/nested forms do not draft.
Shutdown waits for form write acknowledgements. Passwords never persist. List/Grid scenes
carry pagination `pageSize`/`hasMore`; Quick Look props carry file metadata.

## Debugging extensions

`bun run blast run <extensionDir> <command>` is the headless debug client;
its flags, headless capability answers, script commands and exit codes are
in `docs/cli.md`.
