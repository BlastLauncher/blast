# ADR 0045: Measure Form link accessories at the scene boundary

- Status: accepted
- Date: 2026-08-29
- Decision owners: Blast V2 maintainers

## Context

The pinned Raycast declarations allow `Form.searchBarAccessory` to receive a
`Form.LinkAccessory` with a target URL and display text. The corpus probe found
this shape in several otherwise renderable commands, but the compatibility
adapter rejected every non-null `searchBarAccessory` before it could publish a
Form scene. The existing `open.open` capability already provides the explicit
host boundary needed for link activation.

## Decision

Support the measured `Form.LinkAccessory` subset in the adapter. The adapter
publishes a `form-link-accessory` scene child with validated `target` and `text`
properties. Its `onOpen` callback is serialized as a stable scene event ID; when
the event is received, the adapter calls the existing `open.open` capability
with the target. The scene contract permits the accessory only as a child of a
Form and does not grant network access or fetch the target.

Null, non-string, and empty target/text values remain structured compatibility
errors. Unsupported accessory elements are not silently dropped.

## Consequences

- Scene validation and the React renderer now cover the accessory node and its
  event routing independently of Electron or a concrete client.
- The compatibility adapter reuses the existing host-authorized open operation;
  no new network or filesystem capability is introduced.
- Form chrome placement remains client work. Clients that consume the semantic
  scene must choose where the accessory is shown in the Form navigation/search
  bar.
- The scene, renderer, and adapter tests cover validation, event identity, and
  capability routing; corpus reprobes track the measured extension outcome.
