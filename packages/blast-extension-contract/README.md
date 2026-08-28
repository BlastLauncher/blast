# `@blastlauncher/extension-contract`

Transport-independent messages shared by the V2 extension host and extension
runtime.

The first lifecycle contract has two application messages:

1. `extension.initialize` sends the authoritative extension and command
   descriptor from the host.
2. `extension.ready` confirms that the runtime initialized that exact command.

Protocol readiness and extension readiness are deliberately separate. A
negotiated session proves that two processes can communicate; it does not prove
that an extension entrypoint loaded successfully.

This package owns validation for its message payloads. It must remain free of
Node.js, Electron, React, filesystem, and process-management dependencies.
