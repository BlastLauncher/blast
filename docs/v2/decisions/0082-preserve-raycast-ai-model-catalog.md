# ADR 0082: Preserve the Raycast AI model catalog

- Status: Accepted
- Date: 2026-08-30

## Context

`AI` is imported by 100 corpus extensions with 145 measured uses. The
adapter already routes `AI.ask` through the host-owned `ai.ask` capability,
but its runtime `AI.Model` catalog contains only 35 identifiers. The pinned
Raycast declaration contains 158 model constants, and the corpus uses newer
and historical aliases that are not in the adapter's hand-maintained map.

The current open proxy is useful for forward compatibility, but it also
returns an unknown property name unchanged. For a known Raycast constant that
silently changes the value sent to `AI.ask`: for example,
`AI.Model["Anthropic_Claude_4.5_Haiku"]` currently resolves to the enum key
instead of `anthropic-claude-4-5-haiku`.

## Decision

- Mirror every key/value pair from the pinned `AI.Model` declaration in the
  compatibility adapter, including historical aliases whose values map to a
  currently supported provider identifier.
- Keep `AI.Model` typed as an extensible string and retain the runtime proxy
  fallback for unknown keys. This preserves extensions that use an older
  alias or a future model before the adapter's catalog is refreshed.
- Treat the catalog as identifier metadata only. `AI.ask` continues to
  validate prompt/options and route to `ai.ask`; model availability,
  provisioning, execution, streaming, and provider policy remain host work.

## Boundary

This slice does not add AI providers, network access, model discovery, or
provider-specific configuration. The pinned declaration is the compatibility
source for known identifiers; the fallback is deliberately not evidence that
an unknown model is available on the host.

## Evidence

- The local pinned `@raycast/api` declaration contains 158 `AI.Model` enum
  members.
- The compatibility census records 100 `AI` consumers and 145 uses.
- The adapter's current map has 35 entries, so common corpus aliases can
  cross the API boundary with a key string rather than their declared model
  identifier.
- Static namespace and declaration audits found no broader missing `AI.Model`
  behavior; the high-yield correction is the known key/value catalog.

## Consequences

Known Raycast model constants now retain their declared provider identifiers,
including legacy aliases, while arbitrary names remain runtime-extensible.
The change improves option fidelity without coupling the runtime to a model
provider or changing the ARM64 Linux host boundary.

## Verification

The adapter test suite verifies canonical, historical, and unknown model names.
The generated adapter catalog was compared against all 158 string-valued
members in the pinned `@raycast/api` declaration; every pair matches, with the
pre-existing `OpenAI_GPT4_Turbo` spelling retained as a 159th compatibility
alias. The host AI provider boundary and aggregate corpus outcomes are
unchanged.
