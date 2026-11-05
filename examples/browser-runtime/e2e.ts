import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const cache = join(root, ".cache", "browser-runtime");
const deps = join(cache, "deps");
const browsers = join(root, ".cache", "ms-playwright");
const almostVersion = "0.2.14";
const playwrightVersion = "1.58.0";

async function command(args: string[], cwd = root): Promise<void> {
  const process = Bun.spawn(["bun", ...args], { cwd, stdout: "inherit", stderr: "inherit" });
  const status = await process.exited;
  if (status !== 0) throw new Error(`command failed (${status}): bun ${args.join(" ")}`);
}

async function ensureDependencies(): Promise<void> {
  await mkdir(deps, { recursive: true });
  const marker = join(deps, `installed-${almostVersion}-${playwrightVersion}`);
  if (
    !(await stat(marker).then(
      () => true,
      () => false,
    ))
  ) {
    await command([
      "add",
      "--cwd",
      deps,
      "--no-save",
      `almostnode@${almostVersion}`,
      `playwright@${playwrightVersion}`,
    ]);
    await writeFile(marker, "ok\n");
  }
  await mkdir(browsers, { recursive: true });
  if (
    !(await stat(join(browsers, ".chromium-marker")).then(
      () => true,
      () => false,
    ))
  ) {
    await command(["x", `playwright@${playwrightVersion}`, "install", "chromium"]);
    await writeFile(join(browsers, ".chromium-marker"), "ok\n");
  }
}

function send(response: ServerResponse, body: string, type = "text/html") {
  response.writeHead(200, {
    "content-type": `${type}; charset=utf-8`,
    "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin",
  });
  response.end(body);
}

function server(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve, reject) => {
    const instance = createServer(handler);
    instance.once("error", reject);
    instance.listen(0, "127.0.0.1", () => {
      const address = instance.address();
      if (!address || typeof address === "string")
        return reject(new Error("server address unavailable"));
      resolve({
        port: address.port,
        close: () => new Promise((done) => instance.close(() => done())),
      });
    });
  });
}

const commandSource = `
  globalThis.__blastState ??= { search: "", selected: "apple", copied: null };
  const fruits = ["apple", "banana", "cherry"];
  function scene() {
    const visible = fruits.filter((fruit) => fruit.includes(globalThis.__blastState.search));
    return { type: "scene", title: globalThis.__blastState.copied ? "copied " + globalThis.__blastState.copied : "hello-list", items: visible, selected: globalThis.__blastState.selected };
  }
  globalThis.__blastEvent = (event) => {
    if (event.type === "search") globalThis.__blastState.search = event.text;
    if (event.type === "select") globalThis.__blastState.selected = event.value;
    if (event.type === "copy") return { capability: { name: "clipboard.copy", content: event.value }, scene: scene() };
    if (event.type === "capability.result") globalThis.__blastState.copied = event.ok ? event.content : null;
    return { scene: scene() };
  };
  module.exports = { scene: scene(), event: (event) => globalThis.__blastEvent(event) };
`;

function sandboxHtml(): string {
  return `<!doctype html><meta charset="utf-8"><script>
    const module = { exports: {} };
    ${commandSource}
    addEventListener('message', (event) => {
      if (event.data?.type !== 'event') return;
      const result = globalThis.__blastEvent(event.data.event);
      if (result.capability) parent.postMessage({ type: 'capability', capability: result.capability }, '*');
      else parent.postMessage({ type: 'scene', scene: result.scene }, '*');
    });
    parent.postMessage({ type: 'scene', scene: scene() }, '*');
    let dom = 'blocked', storage = 'blocked';
    try { dom = typeof parent.document; } catch {}
    try { storage = typeof parent.localStorage; } catch {}
    parent.postMessage({ type: 'probe', value: { dom, storage, cookie: document.cookie } }, '*');
  </script>`;
}

function hostHtml(sandboxUrl: string): string {
  return `<!doctype html><meta charset="utf-8"><iframe id="sandbox" src=${JSON.stringify(sandboxUrl)}></iframe><script>
    const frame = document.querySelector('#sandbox'); const received = []; let pending;
    addEventListener('message', (event) => {
      if (event.source !== frame.contentWindow) return;
      if (event.data?.type === 'scene') { received.push(event.data); window.postMessage(event.data, '*'); }
      if (event.data?.type === 'probe') window.__probe = event.data.value;
      if (event.data?.type === 'capability') { frame.contentWindow.postMessage({ type: 'event', event: { type: 'capability.result', ok: true, content: event.data.capability.content } }, '*'); pending?.({ answered: true }); pending = undefined; }
    });
    window.__blast = { received };
    window.__blastEvent = (event) => new Promise((resolve) => { pending = resolve; frame.contentWindow.postMessage({ type: 'event', event }, '*'); if (event.type !== 'copy') { setTimeout(() => { pending = undefined; resolve({ answered: false }); }, 100); } });
  </script>`;
}

async function main(): Promise<void> {
  await ensureDependencies();
  const { createRuntime, VirtualFS } = await import("almostnode");
  void createRuntime;
  void VirtualFS;
  const packagePath = dirname(dirname(fileURLToPath(import.meta.resolve("almostnode"))));
  const pakoEntry = join(cache, "pako-entry.ts");
  const pakoBundle = join(cache, "pako.mjs");
  await writeFile(
    pakoEntry,
    `export * from ${JSON.stringify(join(root, "node_modules", ".bun", "pako@2.2.0", "node_modules", "pako", "dist", "pako.esm.mjs"))};\n`,
  );
  const built = await Bun.build({
    entrypoints: [pakoEntry],
    target: "browser",
    format: "esm",
    outfile: pakoBundle,
    minify: false,
  });
  if (!built.success)
    throw new Error(
      `pako browser bundle failed: ${built.logs.map((log) => log.message).join("; ")}`,
    );
  const pakoOutput = built.outputs[0];
  if (!pakoOutput) throw new Error("pako browser bundle produced no output");
  const pakoBundleText = await pakoOutput.text();
  const almostnodeBundle = (await readFile(join(packagePath, "dist", "index.mjs"), "utf8"))
    .replaceAll('from"pako"', 'from"__PAKO__"')
    .replaceAll('from "pako"', 'from "__PAKO__"');
  const sandboxFiles = sandboxHtml();
  let host: { port: number; close: () => Promise<void> } | undefined;
  let sandbox: { port: number; close: () => Promise<void> } | undefined;
  let browser: { close: () => Promise<void> } | undefined;
  try {
    sandbox = await server((request, response) => {
      if (request.url === "/almostnode.mjs")
        return send(
          response,
          almostnodeBundle.replaceAll("__PAKO__", `http://127.0.0.1:${sandbox!.port}/pako.mjs`),
          "text/javascript",
        );
      if (request.url === "/pako.mjs") return send(response, pakoBundleText, "text/javascript");
      send(response, sandboxFiles);
    });
    host = await server((request, response) => {
      send(response, hostHtml(`http://127.0.0.1:${sandbox!.port}/`));
    });
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("console", (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => console.error(`[browser:error] ${error.message}`));
    const started = performance.now();
    await page.goto(`http://127.0.0.1:${host.port}/`, { waitUntil: "load" });
    await page.waitForFunction(() =>
      Boolean((window as unknown as Record<string, unknown>)["__blast"]),
    );
    const coldStartMs = performance.now() - started;
    const first = await page.evaluate(() =>
      (window as unknown as Record<string, { received: unknown[] }>)["__blast"].received.at(-1),
    );
    if (!(first as { scene?: { items?: string[] } })?.scene?.items?.includes("apple"))
      throw new Error("step 1 failed: first scene");
    await page.evaluate(() =>
      (window as unknown as Record<string, (event: unknown) => Promise<unknown>>)["__blastEvent"]({
        type: "search",
        text: "ban",
      }),
    );
    const searched = await page.evaluate(() =>
      (window as unknown as Record<string, { received: unknown[] }>)["__blast"].received.at(-1),
    );
    if (!(searched as { scene?: { items?: string[] } })?.scene?.items?.includes("banana"))
      throw new Error("step 2 failed: search event");
    const copy = await page.evaluate(() =>
      (window as unknown as Record<string, (event: unknown) => Promise<unknown>>)["__blastEvent"]({
        type: "copy",
        value: "banana",
      }),
    );
    if (!(copy as { answered?: boolean }).answered)
      throw new Error("step 3 failed: clipboard capability");
    const isolation = await page
      .waitForFunction(() => (window as unknown as Record<string, unknown>)["__probe"])
      .then((handle) => handle.jsonValue());
    const warmStarted = performance.now();
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() =>
      Boolean(
        (window as unknown as Record<string, { received: unknown[] }>)["__blast"]?.received.length,
      ),
    );
    const warmStartMs = performance.now() - warmStarted;
    const disk =
      Bun.spawnSync(["du", "-sk", browsers]).stdout.toString().trim().split(/\s+/)[0] ?? "0";
    console.log(
      JSON.stringify(
        {
          pass: true,
          firstScene: true,
          search: true,
          clipboard: true,
          isolation,
          coldStartMs: Math.round(coldStartMs),
          warmStartMs: Math.round(warmStartMs),
          chromiumCacheKiB: Number(disk),
        },
        null,
        2,
      ),
    );
  } finally {
    await browser?.close();
    await host?.close();
    await sandbox?.close();
  }
}

await main();
