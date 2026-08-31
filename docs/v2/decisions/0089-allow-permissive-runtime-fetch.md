# ADR 0089: Allow permissive extension-runtime fetch

- Status: Proposed
- Date: 2026-08-31

## Context

The binding-aware audit found one API-bound named `fetch` import in the pinned
Raycast corpus: `coze` passes it as the transport adapter for its SDK. The
Raycast API does not impose a URL allowlist or response policy at this API
surface, and the extension already controls the requests it makes. Blast's
current adapter intentionally leaves this import unresolved because the
earlier plan treated network access as a future host-capability boundary.

The current Node 24 runtime already provides the standard Fetch API. The
launcher runs on ARM64 Linux during measurement, so this slice must stay
portable, deterministic, and free of a new native or network dependency.

## Decision

For the current extension runtime:

- export the measured named `fetch` from `@blastlauncher/raycast-compat` as a
  call-time delegate to `globalThis.fetch`;
- preserve the native Fetch API request and response semantics without adding
  a URL allowlist, consent prompt, timeout, response-size limit, or protocol
  capability in this slice;
- add the export to the static compatibility probe and cover it with a
  deterministic adapter/runtime fixture using a data URL; and
- leave OS/network enforcement for a future native Blast host boundary, which
  may interpose on the runtime implementation before an extension starts.

## Boundary

This is runtime availability, not a security-policy decision. It does not add
a capability message or weaken the deny-by-default broker for explicit host
services. Native extension authors remain responsible for their own native
dependencies and platform support. A later host-policy decision must define
enforcement and consent separately if Blast-native extensions need them.

## Evidence

- The pinned corpus contains one binding-aware `fetch` import, in
  `extensions/coze/src/services/api.tsx`, where it is passed to the Coze SDK.
- Node 24 provides `globalThis.fetch` and supports deterministic `data:` URL
  responses without network access.
- The current probe already resolves literal `@raycast/api` imports through
  the compatibility adapter, so adding the export closes the measured static
  import gap without expanding the bundle or dependency policy.

## Consequences

The current runtime can load extensions that use the measured named `fetch`
import, and the focused `coze` probe should report no static unsupported API.
Direct extension network calls remain an explicit future host-policy concern;
this slice intentionally does not pretend to provide consent, sandboxing, or
resource quotas.

## Verification

- Run the adapter test for delegation and the dependency-free runtime fixture
  for a `data:` URL response.
- Run the focused `coze` probe with concurrency one and inspect its compact
  result for `staticUnsupportedApis: []`.
- Run the V2 test loop, formatting, and the relevant type checks without a
  full-corpus rerun or additional generated bundle storage.
