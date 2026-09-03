# `@blastlauncher/protocol`

Transport-independent wire primitives for Blast V2.

This package must remain free of React, Electron, Node.js runtime APIs, and
transport implementations. It initially defines only the common envelope,
handshake types, and deterministic version negotiation. Messages for scenes and
capabilities will be added with tested vertical slices.

All transport input is `unknown` until it passes the runtime validation helpers.
Validation failures contain stable field paths suitable for diagnostics and
tests. Base-envelope validation accepts unknown message types after negotiation
so later protocol versions can introduce messages without changing the
transport contract.
