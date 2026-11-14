# Quickstart

Blast runs an unmodified Raycast extension and gives your app scenes, view
models and capability requests. These examples use the local release tarballs
so they work from an empty directory after `bun run release:build`.

## Try it

Open [the browser demo](https://blast.yukai.dev/demo/) and choose an extension.
Nothing is installed locally; the demo runs the browser runtime in its sandbox.

## Embed in JS/TS

From the repository, build tarballs, then create an empty app:

```sh
bun run release:build
rm -rf .cache/quickstart-js && mkdir -p .cache/quickstart-js
cd .cache/quickstart-js
npm init -y
npm install ../release/tarballs/*.tgz
```

Save this as `index.mjs` and put a Raycast extension at `./my-extension`:

```js
import { createEngine } from "@blastlauncher/engine";
import { createController } from "@blastlauncher/client-core";
const engine = createEngine();
const extension = engine.openExtension({ extensionDir: "./my-extension" });
const { session } = await extension.launch("index");
const controller = createController({ platform: "macOS" });
session.scenes((scene) => controller.scene(scene));
controller.subscribe((view) => console.log(JSON.stringify(view)));
```

```sh
node index.mjs
```

## Embed in any language

Install the same tarballs in a second empty directory and start the stdio
server. Send one JSON object per line:

```sh
rm -rf ../quickstart-wire && mkdir ../quickstart-wire && cd ../quickstart-wire
npm init -y
npm install ../release/tarballs/*.tgz
./node_modules/.bin/blast-serve
```

```json
{"type":"hello","protocol":1,"capabilities":[]}
{"type":"request","id":"1","method":"extension.open","params":{"dir":"../my-extension"}}
```

Use the returned extension key to send `extension.launch` with
`"views":{"platform":"macOS"}`. Draw `session.view` and send semantic
`session.input`; the [Go example](../examples/go-embedder/) is a complete
standard-library client.

Next: [capabilities](./capabilities.md), the [views reference](./embedding.md),
and [examples](../examples/).
