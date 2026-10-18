# `@blastlauncher/extension-host`

Lifecycle supervisor for Blast V2 extension processes.

Starting a command now means more than spawning a process. The host:

1. reserves the extension/command identity;
2. launches an injected process implementation;
3. accepts and validates a protocol session;
4. verifies that the peer is an `extension-runtime`;
5. sends the authoritative `extension.initialize` descriptor;
6. waits for matching `extension.ready` before publishing the session.

`activeSessions` contains only fully initialized commands. `events` exposes an
async lifecycle stream for a future core daemon, diagnostics service, CLI, or
test client. An unexpected process exit removes the corresponding active
session without terminating the host.

The package depends only on process and transport interfaces. Concrete Node.js
process creation lives in `@blastlauncher/extension-host-node`, so another
runtime or remote process supervisor can implement the same boundary.

## Deliberate gaps

- startup timeout policy belongs to the caller through `AbortSignal`;
- CPU, memory, filesystem, and platform sandboxing belong to concrete launchers;
- restart and retry policy belongs to the future core daemon;
- scene, event, and capability messages will extend the initialized protocol
  session in vertical slices.
