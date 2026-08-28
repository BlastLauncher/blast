# `@blastlauncher/extension-runtime`

Runtime-side initialization framework for Blast V2 extension processes.

`initializeExtensionRuntime` connects to an extension host, verifies the peer
role, receives and validates `extension.initialize`, runs an injected
initialization hook, and only then sends `extension.ready`. It returns the live
protocol session for the renderer and capability layers that follow.

The package intentionally does not load JavaScript modules yet. Module formats,
Raycast compatibility shims, permissions, and renderer setup belong to the
first extension vertical slice. Keeping module loading behind the injected hook
lets tests and future runtimes reuse the same lifecycle contract.

The fixed Node.js bootstrap and ECMAScript entrypoint loading live in
`@blastlauncher/extension-runtime-node`.

## Extension channel

`createExtensionChannel(session, { descriptor })` carries application traffic
over the runtime session (ADR 0008). `publish` validates a transaction and
sends it as `scene.transaction`; `onEvent` registers the handler for valid
`scene.event` messages; `handleMessage` routes one received protocol message
and fails the session when a scene event payload is invalid, because
application messages are untrusted until validated. `requestCapability` sends
a brokered `capability.request` stamped with the descriptor identity and
resolves with the structured response; `close` rejects requests left pending
by a session end. The Raycast compatibility adapter will build on this
channel instead of replacing it.
