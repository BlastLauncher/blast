# `@blastlauncher/core`

Transport-neutral orchestration façade for Blast V2.

Clients ask the core to run a stable `{ extensionId, commandName }` identity.
The core resolves its filesystem descriptor through an injected trusted catalog
and then delegates process/session lifecycle to the extension host. Clients do
not choose entrypoint or root paths.

The first scaffold exposes extension lifecycle events and active sessions,
rejects catalog identity mismatches, prevents starts during shutdown, waits for
in-flight catalog resolutions, and closes the supervisor once.
`relaySessionTraffic` is the single receive pump for one extension session:
it forwards validated scene transactions to a `SceneTransactionSink`, verifies
and executes capability requests through the `CapabilityBroker`, sends scene
events toward the extension, and fails closed on invalid traffic (ADR 0010).
It does not yet host a client-facing protocol server. The first
transport-neutral client/core session boundary is proposed in [ADR
0090](../../docs/v2/decisions/0090-client-facing-core-session-boundary.md);
daemon listeners and Electron wiring remain subsequent slices.

## Next responsibilities

- a persistent, watched extension catalog index
  (`@blastlauncher/core-node` already provides filesystem discovery);
- connected client sessions and command discovery messages;
- capability policy and provider routing;
- structured diagnostics and audit events;
- restart policy and daemon ownership.

Those additions should depend on the interfaces here. They must not make the
core depend on Electron, React, or a concrete transport.
