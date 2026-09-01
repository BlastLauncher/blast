# ADR 0119: Classify extension source provenance in the packaged catalog

- Status: Accepted
- Date: 2026-09-01

## Context

The first Blast release can get useful ecosystem coverage from the public
Raycast extensions repository and from extensions that users manage
themselves. Those channels have different review expectations, but the
path-free command chooser currently has no way to communicate that difference.

Raycast's [official extensions repository](https://github.com/raycast/extensions)
and [publishing workflow](https://developers.raycast.com/basics/publish-an-extension)
are an important curated source for the initial ecosystem. Raycast's
[security guidance](https://developers.raycast.com/information/security)
describes review and CI before merge, but a package obtained from another npm
source may not receive that same upstream review. This classification must not
be confused with signature verification, sandboxing, or a Blast security
attestation.

## Decision

Add a host-assigned `ExtensionSourceKind` to path-free command discovery:

- `local` — an extension in the user's local/development catalog;
- `raycast-curated` — an extension installed from a Blast-managed artifact
  derived from the Raycast-curated ecosystem; and
- `external` — a user-managed extension from another package/source channel,
  presented as **Unreviewed external**.

The catalog root, not the extension manifest, assigns this value. The core
normalizes and validates it before sending discovery data to a client. It is
display metadata only: resolved extension descriptors and child environments
do not receive a trust claim from this field.

Packaged V2 uses these ordered roots:

1. `~/.blast/dev-extensions/node_modules` — `local`;
2. `~/.blast/external-extensions` — `external`;
3. `~/.blast/extensions/node_modules/@blast-extensions` —
   `raycast-curated`.

The first valid manifest for a duplicate extension name wins. This preserves
local development precedence and lets an explicitly placed external package
override a curated package with the same name. The external root uses one
direct subdirectory per extension package; a future importer or installer can
normalize an arbitrary npm layout into that root.

This slice does not clone the upstream repository, download packages, run npm
or pnpm, verify signatures or hashes, sandbox extensions, or promise native
module portability. Dependencies remain user-managed or explicitly provisioned
through the existing local/vendored bundler policy. Native-module support on a
target platform remains the extension author's responsibility.

## Boundary

Source classification belongs to the trusted host catalog and the client
chooser. It is not part of the Raycast manifest contract, extension runtime
context, capability policy, or cryptographic verification layer.

## Consequences

The first packaged client can make the curated/external distinction visible
without claiming more trust than the source channel provides. Existing callers
that do not configure source kinds retain path-free descriptors without the
optional field. Installation, update, artifact pinning, lockfile/audit
provisioning, and stronger verification remain separate application boundaries.

## Verification

- catalog tests cover source propagation, ordered-root precedence, and invalid
  source configuration;
- core and client-boundary tests validate the optional source field and reject
  unknown values;
- the Electron packaged configuration creates the external root and assigns
  all three packaged roots;
- the chooser labels and searches source classifications; and
- focused package tests, formatting, lint, and the existing ARM64 application
  checks remain required, with generated packaging artifacts excluded.
