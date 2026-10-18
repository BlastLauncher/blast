# ADR 0080: Preserve Raycast environment metadata

- Status: Accepted
- Date: 2026-08-30

## Context

`environment` is imported by 638 corpus extensions (19.7%). The compatibility
adapter exposes its complete measured property shape, but it currently falls
back to the extension ID for manifest identity and hardcodes several host
values: Raycast version, development state, appearance, text size, and command
entrypoint type. The pinned Raycast declaration defines these as runtime
environment values; silently losing manifest title/owner data is an avoidable
compatibility gap.

The local corpus has a `title` and `author` on all 3,231 manifests, and 77
manifests also declare an `owner`. Manifest identity can therefore be resolved
by the trusted filesystem catalog without invoking platform APIs. Host-owned
presentation and lifecycle values need an explicit input, but must not be
inferred from this ARM64 Linux measurement process.

## Decision

- Extend the trusted extension descriptor with optional manifest-derived
  `extensionName` and `ownerOrAuthorName` values. Prefer manifest `owner` over
  `author`, and use manifest `title` for the extension name. Omitted legacy
  fields continue to fall back to the extension ID in the adapter.
- Add an optional descriptor `environment` metadata object for host-supplied
  `raycastVersion`, `entryPointType`, `isDevelopment`, `appearance`, and
  `textSize` values. Validate its enums and primitive types at the extension
  contract boundary.
- Have `environment` consume those values while retaining the current
  compatibility defaults (`1.79.0`, `command`, development mode, dark
  appearance, and medium text) when callers provide no metadata.
- Preserve the callable legacy adapter form, deprecated aliases, launch type,
  mode, asset/support paths, and default-deny `canAccess` behavior.

## Boundary

This slice does not detect OS appearance or text-size preferences, decide
whether an extension is installed or in development, negotiate a real Raycast
version, or execute tool entrypoints. The catalog continues to resolve command
entrypoints only. Host/client policy and native rendering remain outside the
Raycast adapter.

## Evidence

- The pinned Raycast declaration documents all environment fields and their
  intended manifest/runtime sources.
- The corpus census records 638 `environment` consumers; the local manifest
  audit found titles/authors on all 3,231 manifests and owners on 77.
- Contract, catalog, adapter, and child-process e2e tests cover the metadata
  path, with aggregate corpus counters unchanged because this is metadata
  propagation rather than provider or dependency support.

## Consequences

Extensions can observe their declared name and owner/author through the same
environment object Raycast provides, and an explicit host can supply scalar
runtime presentation metadata without changing the API surface. Legacy callers
remain deterministic, while unsupported platform inference and tool lifecycle
semantics stay visible as separate follow-up work.
