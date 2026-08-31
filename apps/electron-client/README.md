# The frontend of Blast

The client app uses WebSocket to connect to the backend and then render the JSON element tree.

Most of the code is inside `src/renderer`, which is a React app built with Electron.

The V2 client bridge is opt-in. Set `BLAST_V2_SOCKET_PATH` to an explicitly
started V2 daemon socket to register the main-process bridge; it keeps the
socket and `CoreClientHost` in the main process and exposes only serialized
snapshots and semantic commands through the preload API. The V1 WebSocket
runtime and renderer remain the default, and the app does not yet start the V2
daemon or migrate the existing scene UI.
