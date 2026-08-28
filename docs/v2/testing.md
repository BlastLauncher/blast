# Blast V2 testing strategy

Tests are part of the architecture. Each boundary must have an executable
contract before another package depends on its incidental implementation.

## Test layers

### Protocol validation

`@blastlauncher/protocol` tests unknown wire values, valid control messages,
field-level validation issues, and deterministic version selection. These tests
must not open a transport or depend on Node.js runtime APIs.

### Transport conformance

`@blastlauncher/transport-test-suite` defines behavior shared by every transport
implementation:

- ordered delivery to the opposite endpoint;
- delivery to a reader that is already waiting;
- draining queued messages before reporting closure;
- pair-wide and idempotent closure;
- rejection of sends after closure.

An in-memory, stdio, local-socket, MessagePort, or WebSocket transport is not
complete until it runs this same suite. Transport-specific tests may add framing,
authentication, backpressure, or operating-system failure cases.

`@blastlauncher/transport-node` runs the shared suite against cross-wired Node
streams and adds fragmented frame, multi-frame chunk, malformed JSON, and frame
size tests.

### Session lifecycle

`@blastlauncher/session` tests connector/acceptor negotiation, peer identities,
application-message exchange, incompatible versions, malformed input,
cancellation, graceful shutdown, and invalid state transitions. These tests use
the in-memory transport so failures remain deterministic.

### Extension host integration

Host tests use in-memory runtime peers for lifecycle invariants. The Node host
launcher also runs a real fixture process over stdio and verifies negotiation,
initialization, stderr diagnostics, process identity, graceful shutdown, and
exit status without Electron. Separate fixtures verify a crash before
negotiation and escalation to `SIGKILL` when a child ignores `SIGTERM`.

The Node runtime bootstrap mirrors this with in-memory host peers covering
initialization, entrypoint loading for ESM and CommonJS fixtures, loading
failures, and shutdown. A child-process fixture then proves the launched
bootstrap loads exactly the descriptor's entrypoint and exits cleanly.

Scene traffic adds a deterministic loop: the scene channel validates and
forwards transactions, dispatches valid `scene.event` payloads, fails the
session on invalid events, and replaces handlers on re-registration. An
in-memory host peer runs the full loop — snapshot, action event, and update
transaction — through a `SceneStateBuffer`, and a failing command closes the
session and fails the bootstrap.

### Core orchestration

Core tests prove that untrusted callers supply only stable command identities,
the catalog supplies filesystem descriptors, mismatched catalog results fail,
shutdown gates new work, and in-flight catalog resolution settles before the
extension supervisor closes.

The Node filesystem catalog adds fixture-based tests for manifest discovery,
the `src/<command-name>` entrypoint convention, explicit entrypoint overrides,
rejection of paths that escape the extension root, skipping unreadable or
invalid manifests, deterministic duplicate resolution, and error codes for
missing entrypoints and unreadable catalog roots.

### Renderer conformance

The V2 React renderer will receive fixture trees and record scene transactions
through an in-memory sink. Tests will cover stable node IDs, insert/update/remove
ordering, property removal, event identifiers, snapshots, effects, errors, and
React upgrade compatibility.

`@blastlauncher/scene` already tests the model-level invariants the renderer
relies on: wire validation of transactions and events, the property whitelist
with fixed value types and required properties, parent-child placement rules,
ordered insert/update/remove/reorder application, explicit `null` property
removal, snapshot attachment, descendant removal, and structured referential
integrity errors.

### End-to-end fixtures

Representative extensions become immutable fixtures with named compatibility
expectations. The first walking slice must negotiate, render a list, update one
item, invoke an action, and report a simulated extension crash while the host
remains alive.

## Test rules

1. Prefer in-memory and local fixture tests over timing and network dependence.
2. Test observable contracts, not private method call order.
3. Every bug fix adds a regression test at the lowest boundary that reproduces
   it.
4. Cross-platform providers declare platform requirements explicitly.
5. Generated compatibility reports record the fixture revision and Blast
   protocol version.
6. Performance targets include reference hardware, fixture, sample count, and
   percentile; a single elapsed-time assertion is not a benchmark.

## Commands

From the repository root:

```bash
pnpm run build
pnpm run test
pnpm run test:v2
pnpm run lint
pnpm run fmt:check
```

V2 package tests build their package and use the Node.js test runner. The legacy
packages retain Jest while the prototype remains in the workspace. `test:v2`
is the faster protocol, transport, session, extension-runtime, extension-host,
and core feedback loop; the full root command remains required before
publication. Each V2 package test
builds its transitive workspace closure first, so filtered tests are valid from
a clean checkout and do not rely on stale `dist` output.
