# ADR 0014: Navigation, storage, and environment in the adapter

- Status: accepted
- Date: 2026-08-28

## Context

The support matrix showed that after toasts and preferences, the next
usability blockers are navigation (`useNavigation` 28.8%, `Action.Push`),
`LocalStorage` (26.5%), and `environment` (19.7%). All three are needed
before dependency-free corpus extensions with realistic interaction flows can
run.

## Decision

- **Navigation** lives in the compatibility adapter, not in the wire
  contract. The adapter hosts a navigation stack of mounted views: only the
  top view contributes scene nodes, pushed views stay mounted (their React
  state survives popping), and every push or pop replaces the scene root, so
  clients receive full snapshots through the existing transaction path.
  Clients that only render the current view need no changes; stack metadata
  for back affordances is future work.
- **LocalStorage** is a brokered capability (`local-storage` with `get`,
  `set`, `remove`, `clear`). Requests carry the extension identity attached
  by the host, values are primitives, and a reference in-memory provider
  ships in the capability package; launchers replace it with persistent
  implementations without touching the wire contract.
- **environment()** reports the runtime platform (mapped to Raycast OS
  names), the launch type, the command identity, and a fixed compatibility
  `raycastVersion`; the platform comes from the runtime bootstrap context.
- `Action.Push` composes navigation with the existing action event path:
  activation pushes the target element through the navigation stack.

## Consequences

- realistic interaction flows (list → push → detail → back) run end to end
  over child processes with no protocol changes;
- scene transactions grow with pushed trees rather than a new wire concept;
  clients that want richer navigation UI will receive stack metadata in a
  later measured addition;
- persistent storage, user preference overrides, and `Cache` remain the next
  storage-related increments;
- the support matrix re-probe records how many corpus extensions the
  extended surface unblocks.
