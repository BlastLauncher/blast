# ADR 0117: Make V2 client startup recoverable in the application shell

- Status: Accepted
- Date: 2026-09-01

## Context

The V2 renderer starts its shared main-process client host asynchronously. If
the app-owned daemon or local socket is temporarily unavailable, the renderer
currently shows an error but keeps the body in a loading state with no way for
the user to retry. The command chooser also presents an empty catalog and an
empty search result with the same message, which makes a healthy empty catalog
look like a failed connection or an unsuccessful search.

The first-run Node installer and daemon lifecycle already have separate
recovery policies. This slice should improve only the renderer shell and must
not add a package source, extension installer, dependency provisioning, or a
new protocol message. A retry is valid for a startup failure before the client
host has established a controller; existing command and discovery failures
continue through their current Refresh path.

## Decision

Add a renderer-owned startup retry action. The initial V2 start remains
asynchronous and guarded by the component lifecycle; when it fails before a
snapshot exists, the body presents a concise connection failure state with an
accessible Retry button. Retry uses the existing `start()` bridge and keeps the
control disabled while the attempt is in flight.

Distinguish command-list states in the chooser:

- a non-empty query with no matches says that no commands match the search;
- an empty query with no commands explains that no V2 commands are currently
  available and points to Refresh; and
- the existing header Refresh action remains the only catalog operation.

The renderer does not expose filesystem paths or infer installation success.
The main-process host and daemon contracts remain unchanged.

## Boundary

This is a presentation and transient-startup-recovery slice in the Electron V2
renderer. It does not restart an already-running controller, interrupt an
active command, install or update extensions, or add host capabilities.

## Consequences

Users can recover from a daemon/socket race without restarting the app. Empty
catalogs and empty searches are easier to interpret, while the existing
path-free command discovery and manual Refresh behavior remain intact.

## Verification

- type-check and bundle the Electron renderer;
- server-render the new empty/search states with stable accessible labels;
- preserve the existing command chooser keyboard and refresh behavior;
- run the Electron, V2, format, and lint checks; and
- keep generated packaging artifacts out of the worktree.
