# The frontend of Blast

The client app uses WebSocket to connect to the backend and then render the JSON element tree.

Most of the code is inside `src/renderer`, which is a React app built with Electron.

The V2 client bridge is opt-in. Set `BLAST_V2_SOCKET_PATH` to an explicitly
started V2 daemon socket to register the main-process bridge, or also set
`BLAST_V2_CATALOG_ROOT` and `BLAST_V2_BOOTSTRAP_PATH` to let Electron start the
trusted Node daemon. All three paths must be absolute in app-owned mode;
`BLAST_V2_NODE_EXECUTABLE` optionally selects an absolute Node executable.
The bridge keeps the socket, daemon, and `CoreClientHost` in the main process
and exposes only serialized snapshots and semantic commands through preload.
The V1 WebSocket renderer remains the default without a working V2 opt-in;
with the bridge present, the renderer uses the semantic SceneNode view. Set
`BLAST_V2_MODE=packaged` to use the packaged V2 bootstrap and the existing
`~/.blast/dev-extensions/node_modules` plus
`~/.blast/extensions/node_modules/@blast-extensions` catalog roots (development
extensions win duplicates). Packaged mode remains opt-in and does not install
extensions or third-party dependencies. Menu-bar scenes also project into the
Electron-owned native status-item menu when V2 is active; installation
UI/migration and the remaining scene-visual polish remain future work.
