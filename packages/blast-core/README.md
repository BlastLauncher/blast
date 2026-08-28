# `@blastlauncher/core`

Transport-neutral orchestration façade for Blast V2.

Clients ask the core to run a stable `{ extensionId, commandName }` identity.
The core resolves its filesystem descriptor through an injected trusted catalog
and then delegates process/session lifecycle to the extension host. Clients do
not choose entrypoint or root paths.

The first scaffold exposes extension lifecycle events and active sessions,
rejects catalog identity mismatches, prevents starts during shutdown, waits for
in-flight catalog resolutions, and closes the supervisor once. It does not yet
host a client-facing protocol server.

## Next responsibilities

- manifest discovery and a persistent extension catalog;
- connected client sessions and command discovery messages;
- capability policy and provider routing;
- structured diagnostics and audit events;
- restart policy and daemon ownership.

Those additions should depend on the interfaces here. They must not make the
core depend on Electron, React, or a concrete transport.
