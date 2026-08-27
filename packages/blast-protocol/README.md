# `@blastlauncher/protocol`

Transport-independent wire primitives for Blast V2.

This package must remain free of React, Electron, Node.js runtime APIs, and
transport implementations. It initially defines only the common envelope and
handshake. Messages for scenes and capabilities will be added with tested
vertical slices.
