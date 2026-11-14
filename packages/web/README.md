# @blastlauncher/web

Runs Raycast extensions in any web page. Browser-only (decision 0015): the
package never imports the Node engine, and `packages/web/src` typechecks under
`tsconfig.browser.json`. The extension runs in a cross-origin almostnode
sandbox that the embedding application hosts.

```ts
import { mount } from "@blastlauncher/web";

const session = mount(document.querySelector("#app")!, {
  extension: "raycast/extensions/hello-list",
  sandboxUrl: "https://sandbox.example.com/blast-sandbox/",
  assetsUrl: "/blast/", // almostnode.mjs, esbuild.mjs, esbuild.wasm, blast-sources.json
});
session.input({ type: "search", text: "ban" });
session.close();
```

- `root: true` shows the extension's commands as the engine root view.
- `handlers` overrides the default `storage`, `clipboard` and `openUrl`;
  `handlers.capability` answers or denies any capability first.
- `render(view, input)` replaces the built-in renderer; `theme` is `"light"`,
  `"dark"` or a map of `--blast-*` custom properties.
- `<blast-extension extension="…" sandbox-url="…" assets-url="…">` after
  `defineBlastExtension()`.

`examples/web-embed` is a complete page and `bun run example:web-embed:e2e`
runs it headless against loopback servers.

For deployments with prebuilt extension bundles, pass `bundlesUrl` to `mount`; the
validated `bundles.json` index is tried before source fetching. Extensions that
need required preferences can provide `preferenceForm`, which receives the
parsed fields and current values and returns the submitted values (or
`undefined` to cancel).
