# Quickstart

Blast runs unmodified Raycast extensions and hands your app views to draw.
The engine owns the launcher flow: it lists the commands of every extension
you open as a root view, asks for missing preferences and arguments, installs
dependencies, and runs the command. You draw views and forward input.

## Try it

Open [the browser demo](https://blast.yukai.dev/demo/) and choose an extension.
Nothing is installed locally.

## Get the packages

The API below is newer than `3.0.0-alpha.1`, the latest prerelease on npm
under `next`, and `@blastlauncher/web` is not published yet. Until the next
prerelease, build the packages from source (Bun and Node.js 24):

```sh
git clone --depth 1 https://github.com/blastlauncher/blast && cd blast
bun install --frozen-lockfile
bun run release:build   # tarballs in .cache/release/tarballs/
```

The examples run from inside that checkout against the `hello-list` fixture;
point them at any Raycast extension directory instead.

## Embed in JS/TS

Requires Node.js 24.

```sh
mkdir quickstart-js && cd quickstart-js && npm init -y
npm install ../.cache/release/tarballs/*.tgz
```

Save this as `index.mjs`:

```js
import { createEngine } from "@blastlauncher/engine";
const engine = createEngine();
engine.openExtension({ extensionDir: "../fixtures/extensions/hello-list" });
const root = engine.root({ views: { platform: "macOS" } });
root.subscribe((view) => console.log(`${view.title}: ${view.rows.map((row) => row.title)}`));
await root.ready();
root.input({ type: "primary" }); // run the selected command; its views follow
// Draw `view` in your UI and send input, e.g. root.input({ type: "search", text: "ap" }).
```

```sh
node index.mjs   # Ctrl-C to stop; the command keeps running like in an app
```

It prints the root list (`Commands: hello-list,index`), then the command's
list (`hello-list: apple,banana,cherry`). Grant capabilities with
`createEngine({ handlers: { "clipboard.copy": (params) => … } })`.

## Embed in any language

Start the stdio server from the same `npm install` and send one JSON object
per line:

```sh
npx blast-serve
```

```json
{"type":"hello","protocol":1,"capabilities":[],"views":{"platform":"macOS"}}
{"type":"request","id":"1","method":"extension.open","params":{"dir":"../fixtures/extensions/hello-list"}}
{"type":"request","id":"2","method":"root.open","params":{}}
```

The server answers with `root.view` events carrying the command list and
`{"root":"1"}`. Send `root.input` with `{"type":"primary"}` to launch the
selected command; draw the `session.view` events of the session named in
`root.launched` and send it `session.input` until `session.exited`. The
[Go](../examples/go-embedder/) and [Python](../examples/python-embedder/)
examples are complete standard-library clients; from the checkout root:

```sh
python3 -I examples/python-embedder/embedder.py fixtures/extensions/hello-list
```

## Embed in a web page

No build step: the `@blastlauncher/web` tarball ships the browser bundle and
the sandbox page. Serve its `assets/` directory on your page's origin (here at
`/blast/`) and its `sandbox/` directory on a second origin you control.
Extensions run in that sandbox origin, away from your page's data.

```html
<div id="app"></div>
<script type="module">
  import { mount } from "/blast/blast-web.js";
  mount(document.querySelector("#app"), {
    extension: "raycast/extensions/android-versions",
    sandboxUrl: "https://sandbox.example.com/",
  });
</script>
```

`bun run release:web:e2e` installs the tarball and runs this page against two
loopback origins. Options, theming and custom renderers:
[`@blastlauncher/web`](../packages/web/README.md).

Next: the [embedding guide](./embedding.md), [capabilities](./capabilities.md)
and [examples](../examples/).
