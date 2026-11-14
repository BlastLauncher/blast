# Web launcher example

See the [quickstart](../../docs/quickstart.md) for the three embedding paths.

This example is a small in-process web embedder. It opens a Raycast-compatible
extension with `createEngine`, shows its commands in the engine's root view
(`engine.root`, which also runs launch prompts and the launched command), and
serves each view over Server-Sent Events. The page is vanilla ES modules and
sends semantic input back to the server.

Run it with Node 24 (or Bun for the convenience script):

```sh
bun run example:web ./fixtures/extensions/hello-list
bun run example:web ./path/to/extension --port 8787
```

The server binds to `127.0.0.1` and chooses an ephemeral port by default. The
printed URL contains a random token; the token is required for the page, event
stream and input endpoints. JSON is required for POSTs.

The server has no operating-system integrations. It forwards `clipboard.copy`
and `open.url` as SSE effects; the page performs those effects with the browser
clipboard API and `window.open`. All other capabilities remain denied. This is
suitable for a local demonstration, not a public deployment: anyone who can
read the URL can drive the extension, and the page is trusted to perform the
two forwarded browser effects.

The example intentionally leaves out frameworks, bundlers, Electron, native
handlers, and richer grid/menu-bar UI. It does not provide authentication or
remote hosting.
