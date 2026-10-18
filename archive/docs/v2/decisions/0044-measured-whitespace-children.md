# ADR 0044: Measured whitespace-only collection children

- Status: accepted
- Date: 2026-08-29

## Context

The scene contract intentionally has no text nodes. JSX formatting can still
produce empty or whitespace-only string children inside Raycast collection
components, and those strings were being treated as semantic children. The
corpus probe identified six render failures in `List.Section`, `Form`, and
`ActionPanel` paths that contained only formatting whitespace.

## Decision

All measured collection mappers ignore nullish values, booleans, and strings
whose trimmed value is empty. This applies consistently to form and picker
children, list and grid collections, menu-bar collections, and action groups.
Non-whitespace strings, numbers, intrinsic elements, and other invalid resolved
children remain rejected at the adapter boundary.

## Consequences

Formatting-only children no longer require an unsupported scene text node. The
canonical corpus reprobe moved `5devs`, `ai-humanizer`, `comma-separator`,
`fastmail-masked-email`, `m3o`, and `xkeen-manager` to rendered scenes, while
the adapter test verifies list, action, and form collection behavior together.
