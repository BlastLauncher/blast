# ADR 0043: Measured `ActionPanel.Item` alias

- Status: accepted
- Date: 2026-08-29

## Context

The measured action surface already supported the top-level `Action` and the
legacy `ActionPanelItem` alias, but corpus extensions also use the nested
`ActionPanel.Item` spelling from the Raycast API. Before this slice, the nested
member resolved as an unmeasured function and action panels failed before their
scene could be published.

## Decision

Expose `ActionPanel.Item` as an identity-preserving alias of the existing
`ActionComponent`. It must use the same action validation, event registration,
and scene serialization as `Action`, with no new scene node or capability
operation.

## Consequences

Nested and top-level action spellings now share one compatibility boundary.
Focused diagnostics moved `iridium`, `markdown-reference`, and `vivaldi` to
rendered scenes, while invalid children still produce structured compatibility
errors. The adapter test keeps the nested alias covered alongside the legacy
action aliases.
