# 0021 — Alfred workflows run in the engine

Status: accepted 2026-11-27; extends 0001 and 0010 (no wire changes)

## Context

Issue #47 asks Blast to run Alfred workflows. A workflow is a directory with
an `info.plist` (an object graph of inputs, actions and outputs, plus scripts)
or the same directory zipped as `.alfredworkflow`. They are not React programs,
but they need the same things as Raycast commands: an isolated process, a
drawable UI, preferences and brokered OS actions.

## Decision

1. **First-class engine support in `@blastlauncher/alfred`.** `openExtension`
   accepts unpacked workflow directories (with `info.plist`) and
   `.alfredworkflow` archives alongside Raycast extensions. The package owns
   plist parsing, safe archive extraction, the workflow model and its runtime;
   it has no npm dependencies.
2. **Dedicated child runtime.** Each running workflow command gets one
   `node @blastlauncher/alfred/main` child speaking protocol v1 NDJSON
   (`init`/`ready`/`scene`/`scene.patch`/`event`/`capability.request`/
   `shutdown`). Decision 0001's process isolation holds; protocol v1, embedder
   protocol 2 and embedders do not change.
3. **Scripts are children of the Alfred runtime.** They get the standard
   `alfred_*` environment variables and workflow variables;
   `userconfigurationconfig` maps to Blast preferences (prompted and stored
   like extension preferences). Each script runs in its own process group,
   killed on cancel or shutdown.
4. **Privileged actions use the broker.** `output.clipboard`,
   `action.openurl`, `action.openfile`, `action.revealfile` and the
   `{clipboard}` placeholder become capability requests, denied by default
   (0010). UI objects (Script Filter results, keywords, text views) render as
   ordinary Blast `SceneNode` trees, so every embedder draws them unchanged.
5. **Measured, never claimed.** Compatibility is reported against real Alfred
   workflows. Unsupported or macOS-only objects fail cleanly with a named
   reason, never by crashing the host.

## Why

Reusing the runtime-child boundary keeps one trust and crash model for both
ecosystems, and keeps embedders ignorant of where a scene came from. A
separate package keeps Alfred's object graph out of the React runtime.

## Consequences

- Archives are extracted into a content-hashed cache with zip-slip, symlink
  and size limits; executable bits survive so `scriptfile` objects run.
- Workflows assuming macOS tools (AppleScript, `osascript`) fail on other
  platforms with a named reason.
- Alfred compatibility needs its own corpus and report, separate from
  `compat/` (which measures `@raycast/api` only).
