# ADR 0011: Measured Raycast compatibility surface

- Status: accepted
- Date: 2026-08-28

## Context

The corpus census (`compatibility/README.md`) shows the view stack dominating
extension usage: `ActionPanel` (87%), `Action` (86%), `List` (75%), `Icon`
(74%), followed by feedback and configuration APIs. The runtime exposes a
V2-native command context (descriptor, publish, onEvent, requestCapability),
and the React renderer publishes scene transactions to the mutation sink. The
compatibility adapter must sit between these without becoming the internal
protocol.

## Decision

`@blastlauncher/raycast-compat` implements the first measured surface:

- `List`, `List.Item`, `ActionPanel`, `Action` (with
  `Action.CopyToClipboard`), and `Detail` map onto the scene vocabulary:
  ActionPanel is transparent (actions become children of their item), and
  `Action.CopyToClipboard` performs a brokered clipboard write and then the
  user's `onCopy`;
- `Icon` ships a kebab-case subset serialized into the scene `icon` property;
  object icons, `Color` tinting, shortcuts, and other unmeasured surface
  raise structured `CompatibilityError`s instead of failing silently;
- `Clipboard.copy`/`Clipboard.read` route through the deny-by-default
  capability broker with the extension identity attached by the host;
- `runCommand(context, component)` binds the API singletons to the running
  command, renders through the renderer, and routes scene events back to
  component callbacks; the Node bootstrap exposes a `configureApi` hook so
  launchers bind their API surface before the command runs;
- render errors, including structured compatibility errors, fail the command
  loudly; a denied capability surfaces as a structured compatibility error.

Scene growth is driven by this measurement: the contract gains a `detail`
node type (root-able, `markdown` and `navigationTitle` props) and `icon`
string properties on `list-item` and `action`.

Resolution of literal `@raycast/api` imports to this adapter (bundler alias
or package mapping) is a runtime concern for the bundling slice; fixture
extensions import the adapter by its own name today.

## Consequences

- a real extension shape runs end to end over child processes with brokered
  clipboard access;
- the support matrix can now be measured against named fixtures instead of
  import counts alone;
- toast/HUD feedback, `Form`, `getPreferenceValues`, navigation
  (`useNavigation`, `Action.Push`), and `Color` tinting are the next measured
  additions, in census order;
- the adapter never imports core, hosts, transports, or Electron; it depends
  only on the renderer, the scene contract, and React.
