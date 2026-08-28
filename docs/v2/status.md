# Blast V2 implementation status

This is the handoff ledger for future contributors and agents. Update it when a
slice changes what is executable, what is trusted, or what should happen next.

## Executable today

- A transport-independent protocol validates envelopes, peer identities,
  handshake messages, errors, and shutdown.
- Asymmetric sessions negotiate the highest shared version, assign one session
  ID, enforce ready/closing/closed/failed states, and fail closed on invalid or
  mismatched messages.
- Every transport can run one reusable conformance suite. Both the deterministic
  in-memory transport and the Node.js JSON-lines stream transport pass it.
- The extension lifecycle contract separates protocol readiness from command
  readiness with validated `extension.initialize` and `extension.ready`
  messages.
- The runtime-side framework negotiates with an extension host, validates its
  initialization descriptor, invokes an injected initialization hook, and
  acknowledges the exact command identity.
- The extension host reserves identities, supervises startup and stopping,
  publishes only initialized sessions, removes exited processes, and exposes an
  async lifecycle event stream.
- The Node launcher runs a fixed bootstrap in a dedicated OS process with an
  explicit environment, bounded stdio protocol frames, stderr capture, and
  escalating shutdown.
- A real child-process integration fixture proves the complete lifecycle without
  Electron or WebSocket; failure fixtures cover a pre-handshake crash and a
  process that requires forced termination.
- The core accepts only stable command identities, resolves paths through a
  trusted catalog, delegates lifecycle, and coordinates shutdown with in-flight
  starts.

## Trust boundaries already enforced

- Received transport values remain `unknown` until validators accept them.
- Protocol and extension domain messages have separate validators.
- A runtime must identify as `extension-runtime`; a host must identify as
  `extension-host`.
- The runtime cannot choose which descriptor it runs, and a client cannot choose
  filesystem paths through the core API.
- Node processes are launched without a shell, and environment inheritance must
  be explicit.
- Standard output is reserved for protocol frames.

## Intentionally missing

- manifest discovery and a persistent catalog implementation;
- loading a real CommonJS or ESM extension entrypoint;
- the Raycast compatibility adapter on the V2 runtime;
- semantic scene transactions and the reconciler sink;
- a client-facing core protocol and daemon listener;
- capability declarations, policy, providers, audit records, and consent UI;
- structured logs beyond captured child stderr;
- startup deadlines chosen by the core, restart policy, quotas, and OS sandbox;
- authenticated local sockets, WebSocket transport, and remote pairing;
- Electron V2 integration, CLI control, mobile, and web clients.

## Recommended continuation

Build the first vertical slice rather than adding more infrastructure in
isolation:

1. implement a filesystem manifest catalog behind `ExtensionCatalog`;
2. make the Node bootstrap load one immutable fixture entrypoint;
3. define the smallest semantic scene contract for `List`, `List.Item`, and one
   action;
4. implement an operation sink and deterministic test client before adapting the
   React reconciler;
5. route one clipboard request through a deny-by-default capability broker;
6. test a normal action and a deliberate runtime crash end to end.

Keep WebSocket and remote execution as transport/provider additions. They do not
require changing the session, extension contract, runtime, host, or core
ownership boundaries established here.
