# 0015 — Web embedding: `@blastlauncher/web`

Status: accepted 2026-11-14; extends 0013

## Decision

1. **A browser-only embedder package.** `@blastlauncher/web` owns the browser
   host wiring (fetch, install, bundle, sandbox, runtime port, capabilities)
   and draws views into a page-selected element. It never imports the Node
   engine, and the engine never imports it; logic both need
   (`preference-fields`, `dependency-policy`) lives in `@blastlauncher/protocol`.
2. **The embedder hosts the sandbox.** `mount(element, options)` takes a
   `sandboxUrl` that points at sandbox files the embedding application serves
   itself, plus an `assetsUrl` for almostnode, esbuild-wasm and the Blast
   runtime sources. `blast.yukai.dev`'s sandbox may serve demos only; it is
   not a production dependency.
3. **The page reaches only what the port carries.** The sandbox is cross-origin
   and receives the command bundle and one `MessagePort`. Extension code cannot
   read the page's DOM, globals, cookies or network credentials; the page gets
   serialized views and sends input back through the returned handle.
4. **Default capability answers.** `storage` uses `localStorage` (memory when
   it is blocked), `clipboard` uses the Clipboard API (the browser asks the
   user), `open.url` opens http(s) URLs in a new tab. Everything else is denied
   as in the demo.
5. **The page overrides per capability.** `handlers.storage`, `.clipboard` and
   `.openUrl` replace one default each; `handlers.capability(request, context)`
   sees every request first and may grant, or deny with `DENIED`, before the
   defaults answer.
6. **Views by default, or the page's own.** `root: true` runs the engine root
   view over the extension's commands (0014); otherwise one command runs. The
   built-in renderer is themeable HTML (`--blast-*` properties, `theme`);
   `render(view, input)` replaces it. `close()` ends the sandbox and listeners.

## Why

0013 made the sandbox safe but the working code lived in the demo's client.
Embedding it elsewhere meant copying about 2000 lines. A package with the same
trust boundary lets a page add an extension in a few lines, and keeping the
sandbox origin the embedder's own means the page, not Blast, answers for what
loads next to its data.

## Consequences

- The demo, `<blast-extension>` and third-party pages share one host
  implementation; the demo moves onto it in task 0163.
- Embedders build and serve the sandbox assets (`bun run site:build` produces
  them); there is no CDN-hosted default.
- Prebuilt catalog bundles stay a demo feature until 0163.
