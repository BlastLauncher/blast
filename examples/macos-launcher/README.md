# BlastKit

BlastKit is the Foundation-only SwiftPM client used by the macOS launcher example. It speaks `blast serve` over newline-delimited JSON, exposes typed `ControllerView` and `ControllerInput` values, and routes capability requests to an injected handler.

Run the contract and transport tests with:

```sh
bun run example:mac
```

Regenerate deterministic view fixtures from the real engine with:

```sh
bun run example:mac:fixtures
```

The package targets macOS 14 and uses Swift tools version 6.0. It has no third-party dependencies or Xcode project. Tests use fake transports and capability handlers, so they never touch the system clipboard, open URLs, or launch applications.
