# ADR 0060: Accept React context composites in measured collections

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

The adapter already permits custom function components, fragments, and the
standard memo/forward-ref/lazy wrappers around measured collection children.
The corpus extension `dictionary/fromCmd` also places a
`SearchContext.Provider` directly under `List`. React represents context
providers and consumers as object-valued exotic element types, so the List
mapper rejected the provider before React could resolve its measured children.

This is a composition boundary, not a new scene node or a request to transport
context values to the client. The resolved children must still pass the
existing semantic collection validators.

## Decision

- Treat React context provider and consumer element types as composites in the
  measured child mappers by accepting `Symbol.for("react.context")` and
  `Symbol.for("react.consumer")` alongside memo, forward-ref, and lazy types.
- Let React reconcile the provider/consumer and publish only its resolved
  measured children. Do not serialize context objects or add context-specific
  scene operations.
- Continue rejecting raw text, intrinsic DOM elements, invalid resolved
  children, and other object-valued element types that are not recognized
  React composition wrappers.

## Consequences

- Context-backed collection components can render without source changes; the
  focused `dictionary/fromCmd` reprobe now publishes a scene.
- The compatibility surface remains narrow and transport-neutral. Context
  state remains runtime-local and is not treated as a host capability.
- A focused adapter test covers a provider around a measured List item, while
  the existing child-placement validation remains in force.
