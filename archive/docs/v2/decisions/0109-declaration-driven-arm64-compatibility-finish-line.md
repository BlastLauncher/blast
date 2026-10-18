# ADR 0109: Declaration-driven ARM64 compatibility finish line

- Status: accepted
- Date: 2026-08-31
- Owners: Blast V2 compatibility work

## Context

The corpus census measures which `@raycast/api` names extensions import, and
the runtime probe measures which selected commands reach a scene. Neither
measurement proves that the adapter covers the complete public Raycast
contract. The pinned Raycast declaration is the stable, inspectable source of
that contract, including nested members such as `Action.Open` and
`Form.TextField`.

The next phase is intentionally compatibility-first. Application polish and
performance work must not make an incomplete API surface look finished. The
ARM64 Linux runner is the current measurement environment, but extension-owned
native modules and host-specific providers remain separate responsibilities.

## Decision

Add a deterministic declaration inventory to `@blastlauncher/compatibility`.
It compares the pinned `@raycast/api` declaration entrypoint with the emitted
public declaration of `@blastlauncher/raycast-compat` and records:

- top-level exports;
- public nested namespace and runtime-value members;
- adapter-only compatibility aliases;
- missing declaration members;
- the built adapter's runtime export set; and
- the relationship between declaration members, statically observed corpus
  imports, and runtime-probe outcomes.

The inventory is a contract-shape measurement, not a claim that TypeScript
names alone guarantee semantic fidelity. Adapter tests and the corpus probe
remain required for behavior and end-to-end coverage.

## ARM64 completion policy

“100% on ARM64” means the following compatibility gate is green:

1. every pinned top-level and normalized public nested declaration member is
   represented by the adapter declaration;
2. no portable declaration member is classified as unsupported;
3. every corpus-observed import is either behavior-tested or explicitly
   classified as host/platform deferred; and
4. the corpus probe has no static unsupported API blockers.

The percentage for this gate excludes TypeScript compiler metadata such as
React component `displayName`, `propTypes`, and class prototypes. It does not
silently count host work as complete: browser, OAuth token stores, AI
providers, operating-system discovery, and other provider-backed APIs remain
explicitly classified until a provider boundary exists. Third-party native
module support remains the extension author's platform responsibility.

The declaration gate and the corpus render rate are reported separately. A
rendering failure caused by a missing dependency, process startup, a
non-renderable command mode, or a host provider is not converted into an API
gap.

## Consequences

- The pinned Raycast declaration version becomes an explicit input to every
  compatibility inventory artifact.
- A Raycast API update produces a reviewable declaration diff before it can be
  treated as supported.
- The adapter can finish its portable contract without waiting for the
  Electron client to render every host-owned capability.
- The corpus probe derives its named-import support set from the emitted
  adapter declaration and embeds the inventory, preventing a second static
  allowlist from silently drifting from the compatibility artifact.
- Application-layer polish and performance benchmarks start only after the
  declaration gate and measured portable behavior are complete, unless a
  deliberate decision records an exception.

## ARM64 measurement result

On the 2026-08-31 ARM64 Linux run against `@raycast/api` 2.1.0, the gate is
green: 147/147 top-level exports, 1,167/1,167 normalized nested members,
88/88 declared runtime exports, all 85 corpus-observed API names represented,
and zero static import blockers. The end-to-end corpus result is reported
separately at 2,085/3,231 rendered extensions (64.53%), or 2,085/2,915
renderable commands (71.53%); dependency, process, and non-renderable outcomes
are not treated as API gaps.
