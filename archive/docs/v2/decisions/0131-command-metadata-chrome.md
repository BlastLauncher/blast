# ADR 0131: Forward live command subtitles to the client

- Status: Accepted
- Date: 2026-09-04

## Context

`updateCommandMetadata` crossed `command.updateMetadata` (`{subtitle}` /
`{clear:true}`) to the capability broker, but the broker response returns to
the runtime only. The client never learned about subtitle updates, so the
measured API had no visible chrome: `CoreCommandDescriptor` carries no
subtitle and the chooser/active-command header could not show it.

## Decision

- The extension-traffic relay gains a presentation-only `metadataSink`:
  after a **succeeded** `command.updateMetadata` execution it forwards the
  subtitle string, or `null` for `{clear:true}`. Denied, failed, and
  malformed requests never reach the sink; the broker outcome remains
  authoritative for the extension and malformed chrome input is ignored
  rather than failing the session.
- The client session carries a validated `core.command.metadata`
  `{extensionId, commandName, subtitle?}` message (absent subtitle means
  cleared), sent after `core.command.started` through the existing ordered
  send queue. Unknown types still pass through for forward compatibility.
- The transport-neutral controller tracks `activeCommandSubtitle` in its
  snapshot, accepts updates only for the active command identity, and clears
  it on run/stop/exit/failure/close. The Electron header renders the live
  subtitle under the active-command state. Subtitles are session-local and
  never enter discovery, the catalog, or capability policy.

## Boundary

No catalog, discovery, or provider changes. No production `command`
capability provider is added here: without a granted provider the request
denies and no chrome updates, preserving deny-by-default. Extension
subtitles are untrusted display strings; they are rendered as text and never
used for identity, routing, or authorization decisions.

## Consequences

A running command's `updateCommandMetadata` subtitle becomes visible in the
V2 client header while the command is active and disappears with it. The
information flow is one-way (extension to client chrome) and cannot widen
extension authority.

## Verification

- relay sink tests (succeeded forwards set/clear; denied/malformed never);
- client-boundary message validation (accept set/clear, reject mistyped);
- controller tests (track, clear on stop, ignore inactive identities);
- server-rendered subtitle chrome test;
- `pnpm --filter blast run test`;
- `pnpm run lint` and `pnpm run fmt:check`.
