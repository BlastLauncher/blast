# ADR 0027: Measured action, application, and telemetry boundaries

- Status: accepted
- Date: 2026-08-29

## Context

The refreshed corpus probe identified `captureException`,
`OpenInBrowserAction`, `CopyToClipboardAction`, `getDefaultApplication`, and
`PreferenceValues` as the next static blockers. The two action names are
deprecated Raycast aliases, but the same behavior is also used through
`Action.OpenInBrowser` and `Action.CopyToClipboard`. The group mixes scene
actions, desktop discovery, diagnostics, and a type-only contract, so each
needs an explicit compatibility boundary.

## Decision

- Implement `OpenInBrowserAction` and `Action.OpenInBrowser` with the shared
  action component. URLs are validated during scene construction, default to
  the measured title/icon, and invoke the existing `open.open` capability on
  activation; `onOpen` runs after a successful host response.
- Implement `CopyToClipboardAction` as the shared `Action.CopyToClipboard`
  component. String and numeric content preserve the existing primitive `text`
  wire shape; structured `Clipboard.Content` values are normalized into a
  JSON-encoded `contentJSON` argument. `transient` and `concealed` are
  validated boolean options, and `onCopy` receives the original content after
  a successful write.
- Expose `getDefaultApplication(path)` through
  `application.default`, reusing the validated JSON `Application` result and
  structural `PathLike` serialization used by the other application helpers.
- Return an empty object when a command has no manifest preferences and expose
  `PreferenceValues` as a type-only indexable preference contract.
- Route `captureException(exception)` through `telemetry.captureException` as
  a JSON-encoded exception payload. The API is intentionally fire-and-forget;
  denied or unavailable telemetry is swallowed so diagnostics cannot change
  command behavior.
- Extend deterministic corpus and child-process providers for this measured
  group. Production desktop open/default-application, clipboard, and
  telemetry providers remain client/host work and stay deny-by-default.

## Consequences

- Deprecated and modern action forms can render in the same scene and share
  host capability policy.
- Rich clipboard values cross a transport-safe primitive boundary without
  introducing Node, Electron, or host dependencies into the adapter.
- Extensions without preferences now receive the Raycast-compatible empty
  preference bag, eliminating a startup failure for generic preference code.
- Telemetry is observable to a host while remaining non-essential to command
  execution; production clients must decide retention, redaction, and consent
  policy.
