# ADR 0008: Runtime scene traffic and the command context

- Status: accepted
- Date: 2026-08-28

## Context

ADR 0007 defined the semantic scene contract and its mutation sink. The React
renderer does not exist yet, so the first scene traffic must come from the
extension runtime itself over the existing validated lifecycle session. The
runtime also needs a minimal, transport-independent way for a loaded
extension command to publish scenes and receive user events before the
Raycast compatibility adapter exists.

## Decision

The extension runtime session carries scene traffic in both directions:

- `scene.transaction` flows from the runtime toward the host (and future
  clients) through a `SceneChannel` created on the runtime session;
  transactions are validated before they are sent.
- `scene.event` flows back toward the runtime. The runtime's single message
  pump dispatches valid events to the handler registered by the running
  command. A `scene.event` with an invalid payload fails the session, because
  application messages are untrusted until validated. Other message types are
  ignored for forward compatibility.

The fixed Node bootstrap invokes the entrypoint's `command` (or default)
export with a command context after `extension.ready`:

- `context.descriptor` is the validated descriptor from the host;
- `context.publish(transaction)` sends one scene transaction;
- `context.onEvent(handler)` registers the event handler; the last
  registration wins.

A command that rejects fails the bootstrap and closes the session. Entry
points without a command export load without invoking anything, which keeps
data-only modules and future component-based adapters viable.

## Consequences

- the scene path is proven end to end before the renderer exists; the future
  React renderer publishes to the same session through the same channel;
- the command context is the seed of the V2-native extension API; the Raycast
  compatibility adapter will implement `publish` and `onEvent` over it rather
  than replacing it;
- the host-to-client relay of scene traffic is a separate slice and does not
  change this contract;
- the single-pump model keeps message ordering deterministic and avoids
  competing consumers of the session.
