# ADR 0013: Preference defaults, toasts, and the real-fixture support matrix

- Status: accepted
- Date: 2026-08-28

## Context

The corpus census put toast feedback (`showToast` 71%, `Toast` 69%) and
preference access (`getPreferenceValues` 61%) immediately after the view
stack. A probe over the public corpus confirmed that no extension uses only
the previously measured surface: toasts and preferences block essentially all
real extensions. The support matrix therefore requires this surface first.

## Decision

- Preference defaults are resolved by the trusted catalog from the manifest
  (defaults per preference, checkbox defaulting to `false`) and travel in the
  validated descriptor as `preferences`. `getPreferenceValues<T>()` returns
  them; user-set overrides arrive once preference storage exists.
- Toasts are ephemeral UI state outside the scene tree. The scene contract
  gains a validated `ui.toast` message (`title`, optional `message`, style
  `success`/`failure`/`neutral`); the runtime channel sends it, and the core
  relay forwards payloads to a toast sink. Unknown toast styles normalize to
  `neutral` for compatibility with older extensions.
- `Toast` is a class matching Raycast's shape (`new Toast(options)`,
  `toast.show()`, `Toast.Style`); `Toast.hide` remains unmeasured and raises
  a structured compatibility error. `showToast(options | string)` creates,
  shows, and returns the instance.
- Real extensions must run as fixtures before the support matrix is
  published. Extension bundling keeps React external to the bundle (absolute
  file URLs via an esbuild plugin) because inlining React splits the
  dispatcher between the renderer and the components; async function
  components at the root are awaited once by the adapter, since React client
  rendering rejects async components.
- The support matrix runs committed real-fixture extensions through the full
  pipeline (catalog, bundling, adapter, renderer, relay) and records bundle,
  render, and capability outcomes. Fixtures are trimmed to manifest and
  sources (no `node_modules`), so matrix runs are hermetic and deterministic.

## Consequences

- real extensions can render end to end for the first time, and the matrix
  measures honest results instead of import counts;
- unmeasured third-party packages still fail at bundle time; fixtures are
  selected to be dependency-free, and vendoring policy is future work;
- toast display semantics (timing, stacking, actions) are client concerns
  and stay out of the wire contract;
- user preference overrides, `Toast.hide`, and toast actions are the next
  measured additions.
