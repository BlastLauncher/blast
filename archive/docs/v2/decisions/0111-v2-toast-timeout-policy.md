# ADR 0111: Define the V2 client toast timeout policy

- Status: Accepted
- Date: 2026-08-31

## Context

The Raycast toast contract does not expose a timeout option. Its animated style
is intended for work that stays visible until the extension hides it or updates
it, while the V2 client currently leaves every non-animated toast in the local
stack indefinitely. That makes ordinary success, failure, and informational
feedback accumulate and leaves dismissal behavior dependent on extension code.

The first V2 application boundary needs a bounded client policy without
changing the transport-neutral toast payload or pretending that a client timer
is an extension lifecycle operation.

## Decision

The Electron V2 renderer owns automatic visual expiry:

- `animated` toasts remain visible until an extension `hide` or an update to a
  non-animated style;
- `success` and `neutral` toasts expire after 4,000 ms;
- `failure` toasts expire after 6,000 ms; and
- toasts with a primary or secondary action remain visible until the extension
  hides them, so a client timer cannot silently remove an interactive callback.

Expiry removes the toast from the renderer's local stack only. It does not emit
a new protocol message or call the extension's `hide()` method. If an extension
updates a toast after local expiry, the client may present that update again;
explicit extension lifecycle messages remain authoritative.

Timers are owned by the rendered toast item, are cancelled on unmount or
payload replacement, and restart when the toast is updated. The durations are
Blast V2 client policy constants and are deliberately easy to retune if a
future reference implementation or product decision establishes different
timing.

## Boundary

This decision covers client presentation only. It does not add a timeout field
to `Toast.Options`, change `ui.toast`, add OS notifications, or replace the
extension-owned show/update/hide lifecycle.

## Consequences

Normal feedback no longer remains stuck in the window, animated progress and
interactive action toasts remain available for their intended use, and the
policy is testable without Electron or a real clock. A future native client may
choose its own presentation policy while consuming the same validated payload.

## Verification

- test the style/action timeout matrix and local expiry reconciliation;
- test that server-rendered toast items expose the same presentation surface;
- type-check and Forge-bundle the Electron client; and
- keep the full V2, Electron, lint, and format gates green.
