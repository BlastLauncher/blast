# ADR 0116: Detect catalog changes while the V2 daemon is running

- Status: Accepted
- Date: 2026-09-01

## Context

ADR 0114 made command discovery refreshable, but the packaged daemon still has
no signal that an extension was installed, removed, or updated outside the
process. Requiring every application surface to guess when to refresh makes
the catalog freshness policy easy to miss and leaves the existing Refresh
action as the only way to observe changes.

V1 was never published, so this slice does not need to preserve a V1 watcher,
catalog format, or user-data migration path. The daemon also must not become a
package manager: extension installation, dependency provisioning, and native
module policy remain outside its boundary.

## Decision

Add an explicit Node-only watch lifecycle to `FilesystemExtensionCatalog`.
The catalog watches each configured root and the immediate directories for
installed extensions, invalidates its in-memory index on relevant filesystem
events, and sends one debounced change notification for a burst of events.
Root events resynchronize the immediate extension-directory watches so added
and removed extensions are covered; optional roots remain optional.

`NodeCoreDaemon` owns the watch lifecycle and closes it with the daemon. An
optional daemon callback lets an application request a fresh command snapshot
without adding a protocol message or exposing filesystem paths. The Electron
main process uses that callback only when the shared client is idle; an active
command is never interrupted, and the existing manual Refresh action remains
available for a change observed during a command.

Watchers use non-persistent Node handles and a bounded debounce. They are
closed before the daemon finishes shutting down. The watcher reports change
signals only; it does not read untrusted file contents outside the catalog's
existing validation path and does not install, update, delete, or download
extensions.

## Boundary

This is a local filesystem freshness and application-notification slice across
the Node catalog, daemon composition, and existing Electron client host. It
does not add an installer, dependency management, a persistent catalog index,
recursive file watching, or a new transport/protocol contract.

## Consequences

External extension changes can refresh an idle V2 command chooser while the
daemon remains alive. Updates that occur during an active command are safely
deferred to the next explicit refresh or idle notification. A future installer
can use the same catalog roots and freshness policy without taking ownership
of package execution or dependency compatibility.

## Verification

- watch manifest changes and immediate extension add/remove events with a
  deterministic filesystem fixture;
- close the watcher with the daemon and preserve existing listener shutdown;
- refresh the Electron client only from an idle V2 snapshot;
- run the Node core, Electron, V2, format, and lint checks; and
- keep generated Electron packaging artifacts out of the worktree.
