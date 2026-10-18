# `@blastlauncher/transport`

Transport boundary for Blast V2 protocol messages.

The package defines the connection contract used by hosts and clients. Its
in-memory transport is the reference implementation for deterministic tests.
Local sockets, standard I/O, MessagePort, and WebSocket adapters will implement
the same interface in separate modules without changing protocol messages.

Inbound `messages` are typed as `unknown` deliberately. Deserialization and
process boundaries do not preserve TypeScript guarantees; the session layer
must validate each value before treating it as a protocol envelope.
