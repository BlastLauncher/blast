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

Scene traffic adds a deterministic loop: the extension channel validates and
forwards transactions, dispatches valid `scene.event` payloads, fails the
session on invalid events, and replaces handlers on re-registration. An
in-memory host peer runs the full loop — snapshot, action event, and update
transaction — through a `SceneStateBuffer`, and a failing command closes the
session and fails the bootstrap.

Capability tests cover the request/response validators, the broker's
deny-by-default outcomes (ungranted identities, unknown capabilities, provider
failures), grant-list evaluation, channel request stamping and correlation,
pending-request rejection on session end, and command-context round-trips.

Relay tests prove the core's single pump: scene transactions reach the sink,
capability requests execute through the broker with identity verification and
deny responses without a broker, scene events reach the runtime, invalid
known-type payloads and sink failures close the session and reject
`relay.done`, and runtime shutdown ends the relay cleanly.

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

`@blastlauncher/react-renderer` runs React trees on `react-reconciler` and
records scene transactions through an in-memory sink. The conformance fixtures
cover stable node IDs across updates, insert/update/remove ordering with
positions, property removal as explicit `null`, stable event identifiers for
memoized callbacks and their release on unmount, snapshots for the first
commit, effects flushed deterministically, no-op commits publishing nothing,
loud contract violations (unknown props, text nodes, invalid roots), component
errors reported through `onError` without publishing, and unmount cleanup.
React and `react-reconciler` are pinned; these fixtures are the upgrade gate.

`@blastlauncher/scene` already tests the model-level invariants the renderer
relies on: wire validation of transactions and events, the property whitelist
with fixed value types and required properties, parent-child placement rules,
ordered insert/update/remove/reorder application, explicit `null` property
removal, snapshot attachment, descendant removal, and structured referential
integrity errors.

### Compatibility census

`@blastlauncher/compatibility` scans extensions statically with the TypeScript
compiler API. Fixture tests cover lenient manifest summaries, named/type-only/
aliased/namespace/dynamic/require `@raycast/api` import collection, corpus
directory selection, and deterministic report aggregation (no timestamps;
reports record the corpus revision and protocol version). The committed census
artifact in `docs/v2/compatibility/` is regenerated by script, not by CI.

### End-to-end fixtures

Representative extensions become immutable fixtures with named compatibility
expectations. The first walking slice exists in `@blastlauncher/e2e`: over
real child processes it discovers the fixture from its manifest, launches the
fixed bootstrap, negotiates, renders a list into the scene state buffer,
updates one item after an action event, performs a brokered clipboard write
(granted) and read (denied) and reports both outcomes, and reports a
deliberate extension crash with exit code 43 while the core keeps serving
another command. Cross-process waiting uses bounded polling; assertions
target observable outcomes such as exit codes, broker records, and scene
state.

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
