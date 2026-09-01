# ADR 0115: Align the managed Node runtime with the V2 baseline

- Status: Accepted
- Date: 2026-09-01

## Context

The Electron first-run installer currently requests Node `v18.17.1`, while the
workspace and V2 validation baseline require Node `24.20.0` or newer. The V2
bootstrap and application are built and tested against that newer baseline, so
the installed child-process runtime must not silently lag behind it.

The installer also relaunches the application after a failed installation and
does not give the user a useful retry state. V1 was never published, so there
is no released runtime or user-data migration contract to preserve. Existing
managed runtime directories remain user-owned application data and must not be
deleted as part of this alignment.

## Decision

Define the Electron-managed runtime target as the repository baseline
`v24.20.0` and use it for both the packaged V2 daemon and the retained legacy
runtime path. The existing NRM download mechanism remains responsible for
retrieving the platform/architecture archive; dependency installation and
native-module compatibility remain extension-owned boundaries.

Improve the first-run installer presentation and control flow:

- show the exact required Node version;
- keep the install control disabled while an installation is in flight;
- surface rejected or unsuccessful installations as an accessible error; and
- relaunch only after the runtime is verified, leaving a failed install on the
  installer screen so the user can retry.

Do not automatically remove older managed Node versions. Cleanup and a future
runtime update manager need an explicit storage policy and are separate from
this compatibility alignment.

## Boundary

This is an application-owned runtime prerequisite and first-run UX change. It
does not install Raycast extensions, provision npm dependencies, migrate V1
data, or claim that extension-native modules work on every target platform.

## Consequences

Fresh and upgraded installs use the same Node baseline as CI and the V2
bootstrap. A failed network or archive operation remains visible and
recoverable instead of immediately restarting into the installer again. Users
with older managed runtimes may temporarily retain both versions until a
future explicit cleanup policy is accepted.

## Verification

- assert the application and retained runtime paths share the `v24.20.0`
  target;
- exercise the NRM download/validation tests without a network dependency;
- type-check and test the Electron installer bundle; and
- keep generated packaging artifacts out of the worktree.
