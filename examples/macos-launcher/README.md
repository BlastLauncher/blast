# BlastKit (macOS launcher example)

BlastKit is the Foundation-only Swift package behind the AppKit launcher example
(0107 builds the UI on top). It is a complete client of `blast serve`'s embedder
protocol v1: NDJSON over stdio, the `hello`/`welcome` handshake, request and
response correlation, typed events, the `ControllerView`/`ControllerInput` models
from `packages/client-core`, and capability forwarding to an injected handler.

There are no third-party dependencies, no Xcode project and no build step beyond
SwiftPM. The package targets macOS 14 with `swift-tools-version: 6.0`.

## Build and test

```sh
bun run example:mac          # cd examples/macos-launcher && swift test
```

The suite has three layers:

- **Unit tests** (`FramingTests`, `InputTests`, `ClientTests`) use a fake
  transport and never spawn a process: split/joined/oversized NDJSON lines,
  out-of-order responses, events before their response, malformed lines,
  `version_mismatch`, typed `missing_values`/`missing_dependencies` errors and
  capability round trips.
- **Contract fixtures** (`ViewTests`) decode every recorded `ControllerView`.
- **Integration** (`ProcessIntegrationTests`) starts the real engine, launches
  `fixtures/extensions/hello-list`, moves the selection, runs `primary` and
  answers `clipboard.copy` through a recording handler. It never touches the
  system clipboard or opens applications, and is skipped when `node` is not on
  `PATH`.

## Fixtures

`Tests/Fixtures/*.json` are `ControllerView` snapshots recorded from the real
engine, one per scenario (list, grid, detail, form, menu-bar, toast and an open
action panel). They are the cross-language contract between the TypeScript
engine and this Swift client.

```sh
bun run example:mac:fixtures           # regenerate after an engine change
bun run example:mac:fixtures --check   # what `bun run verify` runs
```

Output is deterministic: object keys sorted, engine ids only, a throwaway
`XDG_DATA_HOME`, and no paths or timestamps. `bun run verify` fails when the
committed fixtures drift from what `blast serve` produces.

## Using it

```swift
let transport = ProcessTransport(
    servePath: "packages/serve/src/main.ts",
    workingDirectory: repositoryRoot
)
let client = BlastClient(transport: transport, capabilityHandler: MyHandlers())
client.onEvent = { event in
    if case .view(_, let view) = event { draw(view) }
}
let welcome = try await client.start(capabilities: ["clipboard.copy"])
let extensionID = try await client.openExtension(dir: "/path/to/extension")
let session = try await client.launchExtension(extension: extensionID, command: "index")
try await client.sendInput(.move(.down), session: session)
try await client.sendInput(.primary, session: session)
```

`ProcessTransport` spawns `node <servePath>` through `/usr/bin/env`; point
`servePath` at `packages/serve/src/main.ts`, an installed `blast-serve`, or pass
extra CLI arguments. `BlastClient.onDiagnostic` reports recoverable protocol
problems (a malformed line is skipped so the stream keeps working).
