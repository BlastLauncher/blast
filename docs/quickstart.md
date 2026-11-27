# Quickstart

Blast runs unmodified Raycast extensions and Alfred workflows and hands your
app views to draw.
The engine owns the launcher flow: it lists opened extensions in a root view,
prompts for missing preferences and arguments, installs dependencies, and runs
commands. You draw views and forward input.

## Try it

Open [the browser demo](https://blast.yukai.dev/demo/) and choose an extension.
Nothing is installed locally.

## Get an extension

Blast runs Raycast extensions from a directory. Fetch one from
[raycast/extensions](https://github.com/raycast/extensions) with a sparse
clone (about 25 MB), or use any Raycast extension directory you have:

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/raycast/extensions raycast-extensions
git -C raycast-extensions sparse-checkout set extensions/android-versions
```

`3.0.0-alpha.10` is `latest` on npm; `@next` follows `main`.

`extensionDir` and `extension.open` also accept an Alfred workflow directory or
an `.alfredworkflow` archive; its commands join the same root view. Alfred
support ships in `@next` until the next release. See [alfred.md](./alfred.md).

## Embed in JS/TS

Requires Node.js 24. Next to `raycast-extensions`:

```sh
mkdir quickstart-js && cd quickstart-js && npm init -y
npm install @blastlauncher/engine
```

Save this as `index.mjs`:

```js
import { createEngine } from "@blastlauncher/engine";
const engine = createEngine();
engine.openExtension({ extensionDir: "../raycast-extensions/extensions/android-versions" });
const root = engine.root({ views: { platform: "macOS" } });
root.subscribe((view) => console.log(`${view.title}: ${view.rows.map((row) => row.title)}`));
await root.ready();
root.input({ type: "primary" }); // launch the selected command; its views follow
// Draw `view` in your UI and send input, e.g. root.input({ type: "search", text: "android" }).
```

```sh
node index.mjs   # Ctrl-C to stop; the command keeps running like in an app
```

It prints the root list (`Commands: Android Versions,Search Android Version`),
then the command's list (`Search Android Version: Android 15,Android 14,…`). Grant
capabilities with `createEngine({ handlers: { "clipboard.copy": (params) => … } })`.

## Embed in any language

Start the stdio server from `quickstart-js` and send one JSON object per line:

```sh
npx -p @blastlauncher/serve blast-serve
```

```json
{"type":"hello","protocol":2,"capabilities":[],"views":{"platform":"macOS"}}
{"type":"request","id":"1","method":"extension.open","params":{"dir":"../raycast-extensions/extensions/android-versions"}}
{"type":"request","id":"2","method":"root.open","params":{}}
```

The server answers with an initial `root.view` (`revision: 1`), then
`root.view.patch` updates, and `{"root":"1"}`. Send `root.input` with
`{"type":"primary"}` to launch the selected command; draw `session.view` and
apply `session.view.patch` for the session named in `root.launched` until
`session.exited`. The [Go](../examples/go-embedder/) and
[Python](../examples/python-embedder/) examples are complete standard-library
clients. Run the Python client from `quickstart-js`:

```sh
npm install @blastlauncher/serve
curl -O https://raw.githubusercontent.com/BlastLauncher/blast/main/examples/python-embedder/embedder.py
python3 -I embedder.py -serve node_modules/@blastlauncher/serve/dist/main.js \
  ../raycast-extensions/extensions/android-versions
```

## Embed in a web page

No build step: `npm install @blastlauncher/web` ships the browser bundle and
sandbox page. Serve `assets/` on your page's origin (here at `/blast/`) and
`sandbox/` on a second origin you control. Extensions run in that sandbox
origin, isolated from your page's data, and are fetched from GitHub:

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

Options, theming, and custom renderers:
[`@blastlauncher/web`](../packages/web/README.md).

Contributors: `bun run release:build` builds the packages as tarballs from a
checkout ([release](./release.md)).

Next: the [embedding guide](./embedding.md), [capabilities](./capabilities.md),
and [examples](../examples/).
