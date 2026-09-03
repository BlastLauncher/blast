# ADR 0083: Preserve Raycast OAuth provider metadata

- Status: Accepted
- Date: 2026-08-30

## Context

The pinned Raycast `OAuth.PKCEClient.Options` contract accepts an optional
`providerIcon` and `description`. Both values are displayed in Raycast's OAuth
overlay and remain available on the client instance. The adapter stores them
on `PKCEClient`, but currently omits them from the host
`oauth.authorizationRequest` capability.

The corpus contains 119 `providerIcon` constructor properties across 118
source files. Dropping this metadata is therefore a measured compatibility
gap even though OAuth browser interaction, PKCE generation, and token storage
remain host responsibilities.

## Decision

- Serialize `providerIcon` at the authorization-request boundary with the
  adapter's existing primitive icon serializer. Carry the resulting
  `providerIcon`, `providerIconDark`, `providerIconFallback`,
  `providerIconFallbackDark`, `providerIconMask`, and tint fields only when
  they are present.
- Carry an explicitly provided `description` string, including an empty
  string, as a primitive capability argument.
- Keep the constructor's public fields and declaration-shaped option types.
  Invalid icon descriptors continue to raise structured compatibility errors
  before the capability broker is called.
- Leave the returned authorization request, URL construction, and token
  lifecycle unchanged. The host owns overlay rendering and all OAuth provider
  operations.

## Boundary

This slice does not render an OAuth overlay, load or validate image files,
open a browser, generate PKCE material, persist tokens, or make network
requests. Icon values cross only as the same bounded primitive fields already
used by the scene and action adapters; host policy decides whether and how to
display them.

## Evidence

- The pinned declaration documents `providerIcon?: Image.ImageLike` and
  `description?: string` on `OAuth.PKCEClient.Options`.
- The compatibility audit found 119 `providerIcon` properties in the local
  corpus, making this a higher-yield metadata correction than another
  provider-specific implementation.
- The existing `serializeIcon` and `serializeIconProperties` helpers already
  validate and flatten every measured `ImageLike` shape at a primitive
  boundary.

## Consequences

OAuth-capable extensions retain the metadata required by a Raycast-style host
overlay without widening the transport to arbitrary objects. Existing hosts
that ignore these optional fields remain compatible, while a future client can
render the metadata without changing the extension API again.

## Verification

The adapter suite verifies light/dark source and fallback variants, mask and
tint metadata, descriptions, and rejection of an invalid provider icon before
the capability broker is called. The full V2 suite remains green; aggregate
corpus outcomes are unchanged because this slice carries metadata only.
