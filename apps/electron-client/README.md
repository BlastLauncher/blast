# The frontend of Blast

The client app uses WebSocket to connect to the backend and then render the JSON element tree.

Most of the code is inside `src/renderer`, which is a React app built with Electron.

The packaged V2 client bridge is the default. Set `BLAST_V2_SOCKET_PATH` to an
explicitly started V2 daemon socket to use external-daemon mode, or also set
`BLAST_V2_CATALOG_ROOT` and `BLAST_V2_BOOTSTRAP_PATH` to let Electron start the
trusted Node daemon with explicit paths. All three paths must be absolute in
app-owned mode; `BLAST_V2_NODE_EXECUTABLE` optionally selects an absolute Node
executable. Use `BLAST_V2_MODE=legacy` to explicitly run the prototype V1
WebSocket/runtime path.
The bridge keeps the socket, daemon, and `CoreClientHost` in the main process
and exposes only serialized snapshots and semantic commands through preload.
The renderer uses the semantic SceneNode view when V2 is active. Set
`BLAST_V2_MODE=packaged` to explicitly select the packaged V2 bootstrap and the existing
`~/.blast/dev-extensions/node_modules`, `~/.blast/external-extensions`, and
`~/.blast/extensions/node_modules/@blast-extensions` catalog roots (local
development wins duplicates, followed by explicit external packages, then the
Raycast-curated channel). The chooser labels external packages as unreviewed;
this is source provenance, not signature verification or sandboxing. Packaged
mode does not install extensions or third-party dependencies. Menu-bar scenes also project into the
Electron-owned native status-item menu when V2 is active; installation UI,
internal V2 migration/update flows, and the remaining scene-visual polish
remain future work. V1 was never released, so this does not imply a V1 user
migration path.
