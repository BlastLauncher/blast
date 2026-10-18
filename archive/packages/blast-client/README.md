# `@blastlauncher/client`

Transport-neutral client consumer for Blast V2.

`CoreClientController` owns the client-side receive pump around a connected
`@blastlauncher/core` `CoreClient`. It requests path-free command discovery,
tracks one active command, materializes validated semantic scenes with
`SceneStateBuffer`, forwards scene events, and publishes immutable snapshots to
subscribers. Toasts can be delivered to an optional callback.

The package does not depend on React, Electron, Node.js, WebSocket, or a
filesystem. The Electron application can subscribe to this boundary from an
adapter without receiving extension entrypoint or root paths.

`CoreClientHost` adds connection ownership around the controller through an
injected `connect` function. It is the seam for application hosts such as
Electron: it publishes controller snapshots to subscribers, forwards command
and scene operations, and keeps the concrete transport out of the UI. Use
`serializeCoreClientSnapshot` before crossing an IPC or other JSON boundary so
host-local error details cannot carry functions or cyclic objects.
