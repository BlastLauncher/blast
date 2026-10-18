# 0001 — Process, protocol, and scene model

Status: accepted 2026-10-18

## Decision

1. **One Node.js child process per running command.** The host spawns
   `node <runtime entry>`; the extension never shares a process with the host
   or another command. A crash, hang, or leak ends only that command.
2. **Newline-delimited JSON over stdio.** stdin carries host→runtime messages,
   stdout runtime→host messages, stderr is captured as logs. Every message is
   one JSON object with a `type` field. Lines have a size cap; an oversize or
   invalid line is a protocol error that terminates the command.
3. **Protocol version handshake first.** The host sends `init` with the
   protocol version and the command `mode` (`view | no-view | menu-bar`); the
   runtime answers `ready` or `error`. Nothing else is accepted before that.
4. **Whole-scene snapshots.** After each React commit the runtime sends the
   full serialized tree as `scene { revision, root }`. Functions never cross
   the wire: callback props become handler references, and the host sends
   `event { node, handler, args }` back. Incremental patches may replace
   snapshots later, only if measurements show a need.
5. **`@raycast/api` is our package.** The runtime resolves `@raycast/api` and
   `react` imports from extension code to its own implementations with Node
   module resolution hooks. Extensions are bundled with esbuild (TSX → ESM)
   with those two modules kept external, so real extensions run unmodified.
6. **Privileged operations are capability requests.** APIs such as
   `Clipboard.copy` send `capability.request { id, name, params }`; the host
   broker denies by default and answers `capability.result`. The runtime
   process gets no ambient host privileges beyond what Node itself grants and
   only an allowlisted environment (no host tokens or credentials);
   OS-level sandboxing is a later concern, not a claim made now.
7. **Three packages:** `protocol` (messages, validation, framing; no
   dependencies), `runtime` (reconciler, API shim, child entry), `host`
   (bundling, spawning, sessions, broker, `blast` debug CLI).
8. **Local storage is scoped to the session's extension.** `LocalStorage` sends
   `storage.get|set|remove|all|clear`; the host keys the store by the extension
   name the session already carries, so params can never name another
   extension and a command only ever reaches its own namespace. Values are
   strings, numbers or booleans in one JSON file per extension under the host
   data directory, replaced atomically (temp file + rename) and serialized per
   session. `open(target, application?)` is two capabilities — `open.url` for
   URLs (a `file:` URL counts as a file), `open.path` for files — denied unless
   granted.

## Why

Extensions are Node programs, so a Node process is the compatibility baseline.
Stdio NDJSON is the simplest transport that any client or test can drive and
read. Snapshots are trivially debuggable and avoid patch-ordering bugs that
consumed much of the previous attempt.

## Consequences

- Large lists cost more per update; measure before optimizing.
- Every new privileged API needs a capability name and a broker test.
- The protocol package is the contract for all future clients.
