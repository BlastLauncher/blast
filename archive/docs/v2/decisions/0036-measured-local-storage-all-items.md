# ADR 0036: Measured LocalStorage all-items compatibility

- Status: accepted
- Date: 2026-08-29

## Context

The pinned Raycast declaration exposes `LocalStorage.allItems<T>()` and the
deprecated top-level `allLocalStorageItems` alias. The corpus uses the modern
method broadly and has a direct use of the deprecated alias. Blast already
implements identity-scoped primitive local storage for individual keys, but it
had no way to retrieve the complete namespace.

## Decision

- Add `LocalStorage.allItems<T>()` and export `allLocalStorageItems` as its
  deprecated alias.
- Add the explicit `local-storage.getAll` operation to the capability boundary.
  The reference provider returns a JSON string containing the extension's
  primitive-valued map, preserving the existing primitive-only capability wire
  contract.
- Decode and validate the response in the compatibility adapter. The adapter
  accepts only an object whose values are strings, numbers, or booleans and
  raises a structured compatibility error for malformed host data.
- Keep storage identity and policy enforcement in the capability broker; the
  runtime does not gain direct persistence access.

## Consequences

Extensions that enumerate their local storage can run through the same
brokered boundary as individual reads and writes. Host providers can replace
the in-memory implementation without changing the adapter contract, while
invalid or unexpectedly structured storage responses remain visible rather
than being passed into extension code.
