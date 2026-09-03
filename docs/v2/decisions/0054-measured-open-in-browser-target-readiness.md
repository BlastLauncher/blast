# ADR 0054: Preserve OpenInBrowser target readiness

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

The pinned Raycast declaration requires `Action.OpenInBrowser` to receive a
`string`, but it does not impose a non-empty constraint. The corpus mounts
this action while asynchronous data is loading (`get-cat-images`), while a
URL argument is empty (`manifest-viewer`), and while a preference or launch
argument is absent (`vikunja` and `webpage-to-markdown`). The adapter's
non-empty render-time check turned those ordinary initial states into
structured command failures.

## Decision

- Type-check `Action.OpenInBrowser.url` and preserve an empty string in the
  action closure and scene action node.
- If the required URL prop is `undefined` at runtime, omit that action from
  the semantic action collection so an unready command can still render.
- Keep `null` and other non-string values as structured compatibility errors.
  Activation of an empty-string action still reaches the existing `open`
  boundary, which validates non-empty host targets.

## Consequences

- The four affected corpus commands render through the adapter under the
  probe's default launch state.
- The scene never receives an invalid URL field because action targets remain
  in the callback closure; missing targets are represented by absence of the
  action, not by a fabricated URL.
- The client and host remain responsible for presenting or rejecting an
  action whose declaration-valid string is empty when it is activated.

---
