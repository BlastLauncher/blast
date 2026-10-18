# Architecture

Current shape only; history lives in git. Decisions: `docs/decisions/`.

```
client (blast CLI today; desktop later)
   │  in-process API
host ── bundles extension (esbuild), spawns runtime, capability broker
   │  NDJSON over stdio  (packages/protocol)
runtime (one Node process per command or provider)
   ├─ React reconciler → scene snapshots
   └─ @raycast/api shim → capability requests for privileged calls
extension code (unmodified, bundled)
```

## Packages

| Package             | Owns                                             | Depends on        |
| ------------------- | ------------------------------------------------ | ----------------- |
| `packages/protocol` | message types, validation, NDJSON framing        | nothing           |
| `packages/runtime`  | reconciler, `@raycast/api` shim, child entry     | protocol, react   |
| `packages/host`     | bundling, process lifecycle, broker, `blast` CLI | protocol, esbuild |

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

`bundleCommand({ extensionDir, command, outDir? })` returns the entry path,
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

`ai.ask` returns a supplied full-text answer as one runtime `data` chunk; abort
stops waiting and suppresses late data. `browser.tabs` / `browser.content` use
supplied tabs and content. These capabilities are denied by default. The CLI
opts in with `--ai-answer` / `--browser-tabs`. AI.experimental_decide requests
`ai.decide` (denied by default); `--ai-decide <file.json>` supplies typed answers
validated by the runtime. Its AbortSignal stops waiting. Supplied browser content is returned as is,
without format conversion, and CSS selectors are unsupported in the headless host.

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

`OAuth.PKCEClient` generates S256 PKCE requests and delegates authorization to
`oauth.authorize` (denied unless a client answers it; CLI: `--oauth-code <code>`).
`oauth.tokens.get|set|remove` need no grant within the session extension. Provider
IDs (default: provider name) key token sets in `<dataDir>/oauth/storage/<extension>.json`;
writes are atomic, serialized within the host, and mode 0600. CLI capability output
redacts token payloads. No browser or redirect server runs in the headless host.

Dropdowns use `storage.get|set` with scope `blast:dropdown` and keys prefixed
`blast:dropdown:` containing command name, component type and dropdown id
(`default` when omitted). The host stores this scope under `<dataDir>/internal/`,
separate from extension LocalStorage, so even identical keys cannot collide;
LocalStorage all/clear do not expose or erase dropdown choices. Controlled
values take precedence. Restoration validates options declared in children;
options hidden inside custom components are not yet discoverable.

`WindowManagement` brokers `window.desktops|list|active|setBounds`. The broker
requires grants; the headless client installs read handlers returning one empty
desktop, no windows, and a rejection for no active window. `window.setBounds`
and `Action.InstallMCPServer` (`mcp.install`) require explicit grants.
`getDefaultApplication(path)` requests `applications.default`; headless rejects
because it has no application association database. `captureException` and
`captureMemorySnapshot` emit runtime error/debug logs without network reporting.
Manifest preference defaults reach `getPreferenceValues()`, with command defaults
and then caller-supplied preferences taking precedence.

`open(target, application?)` requests `open.url` for URLs (a `file:` URL counts
as a file) and `open.path` for files, so a client can grant opening links
without granting file opens.

## Forms

Form fields expose runtime-owned `value` and `onChange`; `Action.SubmitForm`
collects the mounted fields by id. Controlled fields follow their supplied
value; uncontrolled fields retain edits until unmount. Form actions use the
`actions` Slot. Picker options are carried in the scene; no OS dialog opens.
PasswordField keeps its value runtime-side: the scene carries a boolean
`hasValue` (never the value or its length), while `onChange`, focus/blur
events and submit deliver the raw value to the extension. `storeValue` and
drafts are recorded only; field refs remain unsupported. List/Grid scenes
carry pagination `pageSize`/`hasMore`; Quick Look props carry file metadata.

## Debugging extensions

`bun run blast run <extensionDir> <command>` is the headless debug client;
its flags, headless capability answers, script commands and exit codes are
in `docs/cli.md`.

## Status

M1 complete: a bundled extension command runs headlessly end to end via
`bun run blast run <dir> <command>`. Next milestones are in `PLAN.md`.
