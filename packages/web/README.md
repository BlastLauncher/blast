# @blastlauncher/web

Runs Raycast extensions in any web page. The extension runs in a sandbox on a
second origin you host, so it cannot reach your page's DOM, cookies or data.

## Quickstart

```sh
npm install @blastlauncher/web@next
```

Serve two directories from the package as static files, unchanged:

| Directory                                  | Serve on                                   |
| ------------------------------------------ | ------------------------------------------ |
| `node_modules/@blastlauncher/web/assets/`  | your page's origin, e.g. `/blast/`         |
| `node_modules/@blastlauncher/web/sandbox/` | another origin, e.g. `sandbox.example.com` |

```html
<div id="app"></div>
<script type="module">
  import { mount } from "/blast/blast-web.js";
  const session = mount(document.querySelector("#app"), {
    extension: "raycast/extensions/android-versions",
    sandboxUrl: "https://sandbox.example.com/",
  });
</script>
```

`assets/blast-web.js` finds the other assets beside itself. With a bundler,
`import { mount } from "@blastlauncher/web"` and pass `assetsUrl: "/blast/"`.

## Options

- `session.input({ type: "search", text: "ban" })` sends input; `session.close()` ends it.
- `root: true` shows the extension's commands as the engine root view.
- `handlers` overrides the default `storage`, `clipboard` and `openUrl`;
  `handlers.capability` answers or denies any capability first.
- `render(view, input)` replaces the built-in renderer; `theme` is `"light"`,
  `"dark"` or a map of `--blast-*` custom properties.
- `<blast-extension extension="…" sandbox-url="…" assets-url="…">` after
  `defineBlastExtension()`.

`examples/web-embed` is a complete page and `bun run example:web-embed:e2e`
runs it headless against loopback servers.

Hooks for hosts with their own UI (`examples/browser-demo` uses all of them):

- `render(view, input, { scene, status })`: the view, an `input` that returns
  the controller result (`handled` for keys), and the scene it came from.
  `loading` and `error` views come before the first scene and on failure. A
  custom `render` owns `element`; `close()` leaves its contents alone.
- `session.view()` is the running command's view; `session.input()` returns
  the same result as `render`'s `input`.
- `onExit({ reason, view })`: the command closed its window (`quit`) or exited
  with code 0 (`exit`); `view` is its last view (HUD, toast). No-view commands
  report `exit` only. Without it the session returns to its root.
- `commandTitle`: navigation title until the command sets one.
- `esbuild` may be a loader (`() => Promise<esbuild>`) so the wasm loads only
  when a command needs bundling.
- `bundlesUrl`: a prebuilt `bundles.json` (see `examples/browser-demo/prebuild.ts`).
  A `raycast/extensions` command found there runs without fetching GitHub; its
  bytes and files must match the index's digests. The index's shared runtime
  loads into every sandbox first. `buildUrl` (JSON `{ "sha" }`) rejects an
  index from another deploy.
- `preferenceForm(request)`: asked for missing required preferences before a
  launch, and for `openExtensionPreferences`/`openCommandPreferences`
  (`request.scope`). It returns the submitted values, which are saved, or
  `undefined` to cancel; after `open*Preferences` the command runs again.
- `prewarm(options)` starts a sandbox (with the prebuilt runtime) while the
  page is idle; the next `mount()` with the same `sandboxUrl`, `assetsUrl`,
  `bundlesUrl` and `buildUrl` adopts it. Its frame has `data-blast="warm"`,
  then `"session"` once adopted.

## In this repository

Browser-only (decision 0015): the package never imports the Node engine, and
`packages/web/src` typechecks under `tsconfig.browser.json`.
`packages/web/build/assets.ts` builds `assets/` and `sandbox/` for
`release:build`, the browser demo and the examples. After `release:build`,
`bun run release:web:e2e` installs the tarball and runs the quickstart page
against two loopback origins; `bun run release:web:e2e --from-npm <version>`
does the same with a published version.
