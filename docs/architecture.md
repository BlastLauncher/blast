# Architecture

Current shape only; history lives in git. Decisions: `docs/decisions/`.

```
client (embedder UI; reference clients: CLI, OpenTUI terminal, web)
   │  scene → view model, events, timing rules  (packages/client-core)
   │  in-process API or NDJSON stdio (packages/serve)
host ── bundles extension (esbuild), spawns runtime, brokers capabilities
   │  NDJSON over stdio  (packages/protocol)
runtime (one Node process per command or provider)
   ├─ React reconciler → scene + scene.patch updates
   └─ @raycast/api shim → capability requests for privileged calls
extension code (unmodified, bundled)
```

## Packages

| Package                | Owns                                        | Depends on                               |
| ---------------------- | ------------------------------------------- | ---------------------------------------- |
| `packages/protocol`    | messages, validation, NDJSON framing, diffs | nothing                                  |
| `packages/runtime`     | reconciler, `@raycast/api` shim, entry      | protocol, react                          |
| `packages/serve`       | versioned embedder stdio, view patching     | host, client-core, protocol, native      |
| `packages/shared-deps` | optional shared libraries and resolver      | pinned portable npm libraries            |
| `packages/host`        | engine, bundling, sessions, broker, root    | protocol, client-core, esbuild           |
| `packages/client-core` | framework-free view model and input reducer | protocol                                 |
| `packages/native`      | optional OS handlers and browser bridge     | protocol                                 |
| `packages/cli`         | `blast` debug CLI and headless handlers     | host, native, protocol, serve, shared-deps |
| `packages/tui`         | Bun OpenTUI client and tmux palette         | client-core, cli, host, protocol, native |
| `packages/web`         | browser runtime and sandbox host (`mount`)  | client-core, protocol                    |
| `packages/cors-proxy`  | optional Cloudflare Worker proxy for web    | nothing                                  |

`host` only spawns `runtime`; it never imports runtime source. See
[embedding.md](embedding.md) for the embedder API and protocol,
[capabilities.md](capabilities.md) for the broker and native handlers, and
[cli.md](cli.md) / [tui.md](tui.md) for clients. `native.startBrowserBridge`
serves browser tabs and content over a loopback WebSocket (decision 0018).

## Message flow

1. `host → init` (version 1, command, preferences, `environment` including
   `availableAPIs`). Runtime populates `environment` before importing code.
2. `runtime → ready`, then initial `scene` and incremental `scene.patch`
   updates (full `scene` on root kind or root-id changes; decision 0019).
3. `host → event` (`node`, `handler`, `args`) for user input.
4. `runtime → capability.request` / `capability.cancel`;
   `host → capability.progress` / `capability.result`.
5. `host → shutdown`, or the process exits and the host reports `exited`.

## Scene conventions

View and menu-bar commands render a `Navigation` root with `Navigation.Entry`
children. Only the active entry exposes views and handlers; covered entries
stay mounted. `Navigation.props.pop`, `popToRoot`, `clearSearchBar`, and
`closeMainWindow` record client requests (`Toast`, `HUD`, and the first queued
`Alert` follow the entries; decision 0001). No-view commands mount a scene only
for feedback or window close; promise-returning views stay mounted to completion.

Host element `type`s match public Raycast paths (`List`, `List.Item`,
`ActionPanel`, `Detail`, `Form`, etc.). Element-valued props (`actions`,
`detail`, …) render as `Slot` children with `props: { name }` after regular
children:

```
List
└─ List.Item
   ├─ Slot name="actions"  → ActionPanel → Action…
   └─ Slot name="detail"   → List.Item.Detail …
```

Image-likes, color-likes, and shortcuts cross the wire as authored (`null`
included); the shim never resolves icons or picks a platform. `environment` is
populated before import (`appearance` defaults to `"dark"`, `textSize` to
`"medium"`, `entryPointType` to `"command"`, and `canAccess` reads
`init.environment.availableAPIs`).

## Host sessions

`createEngine` groups extension handles, capability `handlers`, `dataDir`,
`installer`, and `inheritEnv`, and owns a single-slot standby runtime pool
(warmed with `--prewarm` on `engine.root()`, keyed by `(nodePath, env)`, claimed
once and never reused, bypassed on explicit `env`, killed on `engine.close()`;
decision 0019). Commands see only an allowlisted env (`PATH`, `HOME`, `USER`,
`LANG`, `LC_ALL`, `TZ`, `TMPDIR`, `TEMP`, `TMP`) unless `inheritEnv` opts in.

Handlers resolve engine → extension → launch, then session-scoped storage,
OAuth tokens, and own-provider AI win. Unregistered capabilities are denied
(decision 0010); thrown handlers return `failed`.

`openExtension` returns a handle with `manifest()`, `watch()`,
`dependencies`, `preferences()`, `savePreferences()` (splits extension and
command scopes), and `launch()` (waits for installs, rejects missing required
values with `MissingLaunchValuesError`, returns `{ session, close }`).
`blast deps` installs `--omit=peer` under `<dataDir>/deps/` and repairs required
non-supplied peers in up to two passes (preferring lock pins, recording
additions in the install key, and warning on conflicts or unresolved peers).

`bundleCommand` runs esbuild (`timeoutMs` default 60,000, 0 disables; `signal`
cancels) and resolves in order: tsconfig `baseUrl`/`paths` inside the extension
dir, `<dataDir>/deps/` installs, then `@blastlauncher/shared-deps`.
`<outDir>/assets` symlinks `<extensionDir>/assets` (read-only copy fallback); the
extension dir is never written. When `cacheDir` and `outDir` are omitted, builds
go under `os.tmpdir()/blast/builds` (removed by the caller); with `cacheDir`
(`<dataDir>/bundles/`), one slot per command is reused until the manifest,
tsconfig aliases, dependency install, bundler, or any input file changes.

`startCommand` spawns Node (`nodePath`, default `node`) running
`@blastlauncher/runtime/main`, uses `<dataDir>/compile-cache/` unless `env` is
set, and applies `scene.patch` via `createScenePatchApplier` (mismatch throws
`PROTOCOL_ERROR` and kills the child; `session.scenes()` replays reconstructed
scenes). `shutdown({ timeoutMs })` sends `shutdown`, then `SIGTERM`, then
`SIGKILL`. `bundleModelProvider` / `startModelProvider` run `ai.modelProvider`
in `model-provider` mode (decision 0006).

The host creates `<dataDir>/support/<escaped-extension>/` before spawn. `Cache`
stores strings under `<supportPath>/cache/<namespace?>` with atomic writes,
byte-based LRU eviction, and in-process subscriber notifications.

## Local storage

`LocalStorage` (`storage.*`) saves one JSON file per extension at
`<dataDir>/storage/<extension>.json` (default `<dataDir>`:
`$XDG_DATA_HOME/blast`). Extension names come from the session, never capability
params. Writes are atomic and serialized; unreadable stores fail instead of
overwriting.

Dropdowns, field `storeValue`, form drafts, and alert `rememberUserChoice` use
scope `blast:internal` under `<dataDir>/internal/`, isolated from extension
`LocalStorage`.

## Forms

Form fields have runtime-owned `value` and `onChange`; `Action.SubmitForm`
collects mounted fields by id. `PasswordField` keeps its value runtime-side
(the scene sends only `hasValue: boolean`). Refs support `focus()` and `reset()`.
`storeValue` and root `enableDrafts` persist via `blast:internal` (passwords
never persist; successful submit clears drafts; pushed forms do not draft).
`startCommand` loads stored drafts into `init.command.draftValues` to hydrate
fields and `LaunchProps.draftValues`; shutdown waits for pending form writes.
List/Grid pagination carries `pageSize`/`hasMore`; Quick Look props carry file
metadata.

## Debugging extensions

`bun run blast run <extensionDir> <command>` is the headless debug client; flags
and script commands live in [cli.md](cli.md). Benchmarks and baseline numbers
live in [performance.md](performance.md) (`bun run bench`).
