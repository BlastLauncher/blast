# ADR 0123: Keep first-release package controls safe and explicit

- Status: Accepted
- Date: 2026-09-01

## Context

ADR 0121 added a narrow Electron bridge for importing, updating, removing, and
rolling back user-managed external packages. The renderer controls are
functional, but removal and rollback currently execute immediately and the
single busy/status treatment does not identify the operation in progress.
Chooser cancellation also produces no visible feedback.

The first release does not need a registry browser, npm resolution,
dependency provisioning, background update checks, or a persistent package
index. Those are separate product and trust boundaries.

## Decision

Polish the existing renderer controls only where it improves safe first-use
behavior:

- require an inline confirmation before remove or rollback;
- show operation-specific busy labels while an operation is running and keep
  all package controls disabled until it completes;
- report chooser cancellation as an explicit no-change status;
- keep success version text and reduced error messages visible through the
  existing live status region; and
- preserve the current ID-only requests, main-process chooser, automatic
  catalog refresh, and sanitized result model.

The confirmation remains renderer-owned and inline so it is deterministic in
the server-rendered tests and does not introduce a new native dialog boundary.

## Explicitly deferred

Do not add package discovery, registry or npm source resolution, dependency
installation, signature verification, progress streaming, package version
indexes, automatic updates, or V2 migration tooling in this slice.

## Consequences

Destructive package actions require an intentional second step, and users can
tell whether an operation is active, cancelled, successful, or failed. The
first release still has only explicit local package lifecycle controls; it does
not pretend to be a package marketplace or dependency manager.

## Verification

- server-render the default controls without exposing filesystem paths;
- server-render the remove/rollback confirmation affordance;
- verify operation labels and cancellation status remain renderer-safe; and
- keep focused Electron tests, type-check, formatting, lint, workspace build,
  and ARM64-safe checks green without generating corpus bundles.
