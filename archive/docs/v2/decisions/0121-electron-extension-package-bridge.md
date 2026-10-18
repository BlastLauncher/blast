# ADR 0121: Bridge external package lifecycle through Electron main

- Status: Accepted
- Date: 2026-09-01

## Context

ADR 0120 provides a validated, Node-only `ExternalExtensionStore`, but the
packaged V2 client has no user-facing way to choose a local extension package
or request an update, removal, or rollback. The renderer must not receive the
external root, arbitrary filesystem paths, or store error details.

## Decision

Add a narrow Electron main-process bridge for the packaged external store:

- the main process creates the store for the packaged external catalog root and
  passes catalog invalidation through the existing daemon-owned refresh path;
- install and update IPC requests open a native main-process file chooser for a
  directory or local `.tgz`/`.tar.gz`/`.tar` archive, so renderer requests carry
  no source path;
- remove and rollback requests carry only a validated extension ID;
- every operation returns a renderer-safe discriminated result containing only
  `{ extensionId, version?, sourceKind }` on success or `{ code, message }` on
  failure; managed directories, source paths, and nested error details are
  omitted; and
- the V2 app exposes minimal install and external-package management controls
  while keeping the existing command chooser and scene flow unchanged.

The bridge reports unavailable and cancelled operations as structured outcomes.
It does not resolve npm names, access the network, run npm/pnpm, install
dependencies, verify signatures, or sandbox extension processes. An external
daemon or legacy V1 mode has no package store and reports the bridge as
unavailable.

## Boundary

Electron main owns native dialogs, filesystem lifecycle, and error reduction.
Preload exposes typed operations without paths. The renderer owns labels,
selection, and presentation only. Dependency provisioning, curated artifact
selection, persistent package indexes, and stronger verification remain later
boundaries.

## Consequences

The first packaged client can explicitly import and manage user-owned external
packages without widening the core protocol or leaking privileged paths to the
renderer. The initial controls are intentionally small; a richer package
browser, progress reporting, artifact metadata, and trust decisions remain
follow-up application work.

## Verification

- packaged daemon configuration identifies the external root without changing
  existing custom/external-daemon configuration;
- IPC validation rejects malformed extension IDs and never accepts renderer
  filesystem paths;
- success and failure results omit managed paths and store details;
- native chooser cancellation is deterministic and does not call the store;
- renderer tests cover disabled/unavailable state and the basic management
  controls; and
- focused Electron tests, type-check, formatting, lint, and the existing ARM64
  package checks remain required without generating corpus bundles.
