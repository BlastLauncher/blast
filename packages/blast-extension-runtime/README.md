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
