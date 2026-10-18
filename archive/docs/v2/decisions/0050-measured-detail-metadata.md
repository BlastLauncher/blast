# ADR 0050: Measure Detail metadata and list detail composition

- Status: accepted
- Date: 2026-08-29
- Decision owners: Blast V2 maintainers

## Context

The pinned Raycast corpus uses `Detail` in 1,203 extensions and 2,157 source
locations. `List.Item.Detail` and `Detail.Metadata` are common nested forms
in the source corpus, but the adapter previously dropped detail metadata and
list detail props at the runtime boundary. The same reprobe also exposed two
measured icon members, `Icon.CircleProgress` and `Icon.AppWindowList`, and a
corpus command that uses `Action.SubmitForm` from a non-Form Detail action
panel.

## Decision

- Represent Detail metadata explicitly in the scene contract with nodes for
  labels, separators, links, tag lists, and tag-list items. Validate text,
  colors, icons, links, and tag callbacks at the adapter edge.
- Expose `List.Item.Detail` as the same implementation as `Detail`, including
  the measured metadata namespace. Allow list items to carry a detail child,
  preserve `List.isShowingDetail`, and serialize title/subtitle value and
  tooltip descriptors.
- Preserve `Detail` loading and navigation-title props in the scene. Detail
  metadata and action panels remain scene children; no new host capability is
  introduced by this composition boundary.
- Permit the measured generic use of `Action.SubmitForm` outside `Form`. In
  that position, activation invokes the callback with an empty value bag;
  inside a Form, existing field registration and value validation remain
  unchanged.
- Add the observed `Icon.CircleProgress` and `Icon.AppWindowList` members to
  the explicit icon subset. Unknown icon members remain unsupported.
- Keep empty or missing `Action.OpenInBrowser` targets as structured
  compatibility errors. The corpus probe launches commands with empty
  arguments, so input-dependent failures are not hidden by dropping actions
  or sending malformed host requests.

## Consequences

- Detail-oriented extensions can publish a semantically inspectable scene,
  and list/detail compositions work through the same renderer and scene
  validation path.
- Metadata tag callbacks use normal scene event identifiers; native detail
  layout, selection behavior, and host-side presentation remain client work.
- Focused adapter, scene, child-process matrix, and corpus probes cover the
  new boundary. The current canonical report records 1,327 rendered
  extensions (41.07%) and three structured input-dependent URL failures;
  dependency outcomes remain separately tracked in the matrix.
