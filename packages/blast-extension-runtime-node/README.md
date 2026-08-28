# `@blastlauncher/extension-runtime-node`

Node.js extension runtime bootstrap for Blast V2.

`runNodeExtensionBootstrap` is the fixed bootstrap ADR 0006 describes: it
negotiates a versioned protocol session as `extension-runtime`, loads the
descriptor's entrypoint when the host sends `extension.initialize`, observes
the loaded module, sends `extension.ready`, and drains application messages
until the session closes or the host shuts down. It defaults to the process
stdio transport so a spawned extension process needs no additional wiring.

`loadExtensionEntrypoint` resolves absolute entrypoint paths through the
ECMAScript module loader. CommonJS entrypoints appear as the `default` export
of the returned namespace. Existence checks belong to the trusted catalog;
load failures surface here as structured `entrypoint_*` error codes.

## Command context

After `extension.ready`, the bootstrap invokes the entrypoint's `command`
(or default) export with a context of `descriptor`, `publish(transaction)`,
`onEvent(handler)`, and `requestCapability(request)` (ADR 0008). The single
message pump dispatches valid `scene.event` payloads to the registered
handler and resolves capability requests with `capability.response`
messages; an invalid scene event closes the session, and a rejecting command
fails the bootstrap. Pending capability requests are rejected when the
session ends. Entry points without a command export load without being
invoked.

## Boundaries

- module loading stays behind an injected hook so alternative runtimes and
  deterministic tests reuse the same lifecycle;
- the bootstrap never chooses what to run: the descriptor comes from the
  validated `extension.initialize` message, whose paths the trusted catalog
  resolved;
- this package may use Node.js APIs but must not depend on Electron, React,
  the prototype packages, or any concrete client.
