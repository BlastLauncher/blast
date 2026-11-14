# macOS launcher example

See the [quickstart](../../docs/quickstart.md) for the three embedding paths.

An AppKit launcher that runs Raycast-compatible extensions through `blast serve`.
The package has three layers:

- **BlastKit** — a Foundation-only client for the embedder protocol: NDJSON over
  stdio, the `hello`/`welcome` handshake, request/response correlation, typed
  events, `ControllerView`/`ControllerInput` models, capability forwarding.
- **BlastPresenter** — pure Swift (Foundation + BlastKit, never AppKit). It
  turns a `ControllerView` into `LauncherDisplay` values (rows with title,
  subtitle, icon text and selection; search text and placeholder; action rows
  with shortcut labels; toast; detail markdown; empty and loading states; title
  and back affordance) and maps `LauncherKey` presses to `ControllerInput`.
  `LauncherRouter` sends input to the engine's root view, or to the session
  the root launched until its `session.exited`.
- **BlastLauncher** — a thin AppKit executable: an `NSPanel`, a search field, a
  view-based `NSTableView`, a `NSTextView` for detail and a small action panel.
  It renders `LauncherDisplay` and forwards keys and clicks back as semantic
  inputs.

Everything under test is the presenter or the rendered views; no part of the
suite needs a human at the keyboard.

## Run

From the repository root (so the launcher can find `packages/serve/src/main.ts`):

```sh
swift run --package-path examples/macos-launcher BlastLauncher fixtures/extensions/hello-list
```

That opens the engine's root view with the extension's commands; Return (or a
click) launches the selected command, with launch prompts for anything
missing. Pass a command name to search for it and launch it at once:

```sh
swift run --package-path examples/macos-launcher BlastLauncher fixtures/extensions/hello-list index
```

If the engine is elsewhere, set `BLAST_REPO_ROOT` to a checkout that contains
`packages/serve/src/main.ts`. `MacOSCapabilityHandler` is the only layer that
touches system state:

- `clipboard.copy` writes text, HTML or a file URL to `NSPasteboard`.
- `clipboard.paste` writes the content, hides the launcher and posts ⌘V with
  `CGEvent`; `closeMainWindow: false` unhides it after the paste. Posting
  keystrokes requires **Accessibility permission**; without it the request
  fails with `accessibility_required`.
- `open.url` and `open.path` use `NSWorkspace`, honouring an optional
  `application` (a name, a path, or an object with `path`/`bundleId`/`name`) and
  falling back to the default application when it does not resolve.

The HUD is not a capability: the engine reports it as `feedback.hud`, which
client-core already times, and the window draws it as a small transient overlay.
Tests inject `CapabilityRouter` handlers and never touch these real APIs. The
default global shortcut is ⌥Space; it is registered with Carbon
`RegisterEventHotKey`, so it fires while another app is frontmost, swallows the
keystroke and toggles the panel.

## Build and test

```sh
bun run example:mac          # cd examples/macos-launcher && swift test
```

The suite has four layers:

- **BlastKit unit tests** (`FramingTests`, `InputTests`, `ClientTests`,
  `CapabilityArgumentsTests`) use a fake transport and never spawn a process;
  capability arguments (clipboard content, open targets and applications) are
  parsed and asserted without touching the pasteboard, `NSWorkspace` or files.
- **Contract fixtures** (`ViewTests`) decode every recorded `ControllerView`.
- **Presenter tests** (`PresenterTests`, `LauncherRouterTests`) drive
  `LauncherPresenter` over all nine fixtures: list, grid, detail, form,
  menu-bar, toast, an open action panel, the root view and a launch prompt, and
  route input between the root and its session. They assert rows, selection, search
  text, action shortcut labels, toasts, markdown, empty/loading states, the back
  affordance, and the key mapping for arrows, Return, ⌘K, ⌘↵, Esc and typing.
- **AppKit view tests** (`AppKitTests`) build the real window offscreen, with no
  event loop and no ordering front, and assert the rendered cell titles,
  selected row, detail text, toast, HUD overlay, and action-panel visibility.
- **End to end** (`LauncherEndToEndTests`) starts the real `blast serve`, opens
  `fixtures/extensions/hello-list`, and drives it through the presenter: search,
  move down, Return, and a fake `clipboard.copy` handler that must receive the
  selected text. It is skipped when `node` is not on `PATH`.

Neither the tests nor the launcher's startup path in CI touch the system
clipboard, open applications, post keystrokes or register the global shortcut.
The executable is only built and its usage path checked; the window tests use it
offscreen.

## Fixtures

`Tests/Fixtures/*.json` are `ControllerView` snapshots recorded from the real
engine, one per scenario — the cross-language contract between the TypeScript
engine and this Swift client.

```sh
bun run example:mac:fixtures           # regenerate after an engine change
bun run example:mac:fixtures --check   # what `bun run verify` runs
```

Output is deterministic: object keys sorted, engine ids only, a throwaway
`XDG_DATA_HOME`, and no paths or timestamps.

## Using BlastKit directly

```swift
let transport = ProcessTransport(
    servePath: "packages/serve/src/main.ts",
    workingDirectory: repositoryRoot
)
let client = BlastClient(transport: transport, capabilityHandler: MyHandlers())
client.onEvent = { event in
    if case .rootView(_, let view) = event { draw(view) }
    if case .view(_, let view) = event { draw(view) }
}
let welcome = try await client.start(capabilities: ["clipboard.copy"])
_ = try await client.openExtension(dir: "/path/to/extension")
let root = try await client.openRoot(views: .macOS)
try await client.sendInput(.move(.down), root: root)
try await client.sendInput(.primary, root: root)
```

After `.rootLaunched(root:session:)`, send input to that session until its
`.exited`; `LauncherRouter` does this bookkeeping. `launchExtension` still runs
one command directly, without the root.

`ProcessTransport` spawns `node <servePath>` through `/usr/bin/env`; point
`servePath` at `packages/serve/src/main.ts`, an installed `blast-serve`, or pass
extra CLI arguments. `BlastClient.onDiagnostic` reports recoverable protocol
problems (a malformed line is skipped so the stream keeps working).
