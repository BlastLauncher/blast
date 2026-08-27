# `@blastlauncher/extension-host`

Lifecycle boundary for Blast V2 extension processes.

This package defines extension identities, protocol connections, and process
launch/stop behavior without selecting a transport or JavaScript runtime. The
first concrete launcher will use isolated Node.js processes.
