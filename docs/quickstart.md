# Quickstart

Blast runs an unmodified Raycast extension and gives your app view models and
capability requests. Packages are on npm under the `next` tag (alpha). The
examples run the `hello-list` fixture from a checkout of this repository;
point them at any Raycast extension directory instead.

## Try it

Open [the browser demo](https://blast.yukai.dev/demo/) and choose an extension.
Nothing is installed locally; the demo runs the browser runtime in its sandbox.

## Embed in JS/TS

Requires Node.js 24.

```sh
mkdir quickstart-js && cd quickstart-js && npm init -y
npm install @blastlauncher/engine@next @blastlauncher/client-core@next
```

Save this as `index.mjs`:

```js
import { createEngine } from "@blastlauncher/engine";
import { createController } from "@blastlauncher/client-core";
const engine = createEngine();
const extension = engine.openExtension({ extensionDir: "../fixtures/extensions/hello-list" });
const { session, close } = await extension.launch("index");
const controller = createController({ platform: "macOS" });
// Forward the controller's events to the command; run its timers.
const apply = ({ events, effects }) => {
  for (const e of events) session.sendEvent(e.node, e.handler, e.args);
  for (const f of effects)
    if (f.type === "schedule") setTimeout(() => apply(controller.tick(f.token)), f.ms);
    else close();
};
session.scenes((scene) => apply(controller.scene(scene)));
controller.subscribe((view) => console.log(view.rows.map((row) => row.text).join("\n")));
// Draw `view` in your UI; send input with apply(controller.input({ type: "search", text: "ap" })).
```

```sh
node index.mjs
```

## Embed in any language

Start the stdio server and send one JSON object per line:

```sh
npx -p @blastlauncher/serve@next blast-serve
```

```json
{"type":"hello","protocol":1,"capabilities":[]}
{"type":"request","id":"1","method":"extension.open","params":{"dir":"fixtures/extensions/hello-list"}}
```

Use the returned extension key to send `extension.launch` with
`"views":{"platform":"macOS"}`. Draw `session.view` and send semantic
`session.input`; the [Go example](../examples/go-embedder/) is a complete
standard-library client.

From a checkout, `bun run release:build` writes the same packages as tarballs
under `.cache/release/tarballs/` to install instead of `@next`.

Next: [capabilities](./capabilities.md), the [views reference](./embedding.md),
and [examples](../examples/).
