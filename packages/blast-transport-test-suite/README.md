# `@blastlauncher/transport-test-suite`

Reusable behavioral contract for Blast V2 transports.

Every concrete transport calls `defineTransportConformanceSuite` from its tests
with a pair factory and two representative messages. The suite verifies:

- ordered delivery to the opposite endpoint;
- pending-reader delivery;
- queued-message draining before the closed signal;
- pair-wide, idempotent closure;
- rejection of sends after closure.

The helper is structurally typed and intentionally does not depend on the
production transport or protocol packages. This avoids a dependency cycle when
transport implementations use it as a development dependency.
