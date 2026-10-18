# `@blastlauncher/extension-host-node`

Concrete Node.js child-process launcher for `@blastlauncher/extension-host`.

Each command receives a dedicated Node.js process. The configured bootstrap
module is fixed by the host; the command descriptor crosses the validated
protocol only after session negotiation. No shell is involved. Standard input
and output are reserved for bounded JSON-lines protocol frames, while standard
error is drained into an injected diagnostics callback.

The launcher requires an explicit environment object or factory. This prevents
accidental ambient environment inheritance from becoming an invisible API.
Compatibility mode may pass `process.env`; distributed mode should construct a
small allowlist and route secrets through capability providers instead.

Stopping first allows protocol/stdio shutdown, then sends `SIGTERM`, and finally
uses `SIGKILL` after a configurable grace period. OS-level sandboxing and hard
CPU or memory limits are still required before untrusted distributed
extensions are supported.
