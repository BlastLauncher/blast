# Architecture

Current shape only; history lives in git. Decisions: `docs/decisions/`.

```
client (blast CLI today; desktop later)
   │  in-process API
host ── bundles extension (esbuild), spawns runtime, capability broker
   │  NDJSON over stdio  (packages/protocol)
runtime (one Node process per command)
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

1. host → `init` (protocol version, command, preferences)
2. runtime → `ready`, then `scene` after every commit
3. host → `event` for user input (handler reference + args)
4. runtime → `capability.request`; host → `capability.result`
5. host → `shutdown`, or the process exits/crashes and the host reports it

## Scene conventions

View commands have a `Navigation` root with ordered `Navigation.Entry` children.
Only the active entry exposes view contents and handlers; covered views stay
mounted. `Navigation.props.pop` requests back above depth one (decision 0003),
and `props.popToRoot` records the options of the latest `popToRoot()` call —
Blast has no client search-bar state, so `clearSearchBar` is a request for
clients. Feedback children follow the entries: `Toast`, `HUD`, and the first
queued `Alert`, with action handlers on `Toast.Action` / `Alert.Action` children
(decision 0004). No-view commands mount this scene only when showing feedback.

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

## Host sessions

`bundleCommand({ extensionDir, command, outDir? })` returns the entry path,
extension/command names and manifest mode. Pass those to
`startCommand({ ...bundled, broker: createBroker(handlers) })`. The host resolves
`@blastlauncher/runtime/main` and spawns an explicit Node binary (`nodePath`,
default `node`); it never imports runtime source.

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

`open(target, application?)` requests `open.url` for URLs (a `file:` URL counts
as a file) and `open.path` for files, so a client can grant opening links
without granting file opens.

## Debugging extensions

`bun run blast run <extensionDir> <command>` bundles a command, runs it in a
runtime child process, and prints every published scene as a text tree (one
node per line, handler props as `[onAction]`; `# log` and `# capability` lines
interleave for logs and capability requests). `--grant <capability>` grants a
capability — a granted `clipboard.copy` records and prints the copied text
instead of touching an OS clipboard. `--script <file|->` drives the run with
one command per line: `action <title>`, `back`, `confirm`, `dismiss`,
`search <text>`, `dropdown <value>`, `field <id> <value>`, `submit`, `wait`,
`expect <text>`, `quit`. Form fields expose runtime-owned `value` and `onChange`;
`field` sends strings, or `true`/`false` for checkboxes (dates use ISO strings).
`submit` runs the first `Action.SubmitForm`, which collects the mounted form
fields by id. Controlled fields follow their supplied value; uncontrolled fields
retain edits until unmount. Form actions use the `actions` Slot. `storeValue`
and drafts are recorded only; field refs remain unsupported. `--json`
emits the protocol messages as NDJSON instead.
`--timeout <ms>` bounds the run. Exit codes: 0 success, 1 script or
expectation failure, 2 usage error, 3 extension crash or protocol error.

## Status

M1 complete: a bundled extension command runs headlessly end to end via
`bun run blast run <dir> <command>`. Next milestones are in `PLAN.md`.
