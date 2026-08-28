# `@blastlauncher/transport-node`

Node.js stream transports for Blast V2. The initial implementation carries one
JSON protocol envelope per UTF-8 line and is suitable for child-process
standard input/output and other trusted local streams.

`createJsonLineTransport` accepts explicit readable and writable streams.
`createProcessStdioTransport` binds the same implementation to the current
process. Frames are bounded to 8 MiB by default, parsed values remain untrusted
until their protocol or domain validator accepts them, and malformed framing
fails the message iterator.

Standard output is exclusively protocol data when this transport is used in an
extension runtime. Human-readable logs belong on standard error or in a future
structured log message.

This is a local transport, not a remote security boundary. Network transports
must add authentication, encryption, origin policy, and independent resource
limits while preserving the same `ProtocolTransport` contract.
