import { proxyNotice } from "./template.ts";
// Landing page for Blast: centered product hero with live Browser demo and Terminal switch,
// plus one technical section below. Zero external requests, responsive at 360px, dark mode.

import { escapeHtml, highlightCode, highlightNdjson } from "./highlight.ts";
import {
  coverageUrl,
  fontFacesCss,
  fontPreloadHtml,
  repoUrl,
  siteHeaderCss,
  siteHeaderHtml,
  sweepUrl,
  themeTokensCss,
  tmuxRepoUrl,
} from "./site-chrome.ts";

export interface SiteStats {
  coverage: { covered: number; total: number; percent: string };
  rendered: number;
  commands: number;
}

export const landingSnippets = {
  js: String.raw`import { createEngine } from "@blastlauncher/engine";

const engine = createEngine({ handlers: { "clipboard.copy": (params) => copy(params) } });
engine.openExtension({ extensionDir: "./my-extension" });
const root = engine.root({ views: { platform: "macOS" } });
root.subscribe((view) => draw(view)); // the command list, prompts, then the command
root.input({ type: "search", text: "ap" });
root.input({ type: "primary" });`,
  web: String.raw`<div id="app"></div>
<script type="module">
  import { mount } from "/blast/blast-web.js";
  mount(document.querySelector("#app"), {
    extension: "raycast/extensions/android-versions",
    sandboxUrl: "https://sandbox.example.com/",
  });
</script>`,
  go: String.raw`client, _ := Start("packages/serve/src/main.ts", os.Stdout) // spawns blast serve, views on
defer client.Close()
client.Open("./my-extension")
client.OpenRoot() // root.view events: the command list, drawn as they arrive
client.Input(controllerInput{Type: "search", Text: textPointer("ap")})
client.Input(controllerInput{Type: "primary"}) // root.launched: input goes to the session`,
  py: String.raw`from embedder import Client  # spawns blast serve; views on in the hello

client = Client()
client.request("extension.open", {"dir": "./my-extension"})
client.root = client.request("root.open", {})["root"]  # root.view events are drawn
client.input({"type": "search", "text": "ap"})
client.input({"type": "primary"})  # root.launched: input goes to the session
client.shutdown()`,
  swift: String.raw`let blast = BlastClient(transport: ProcessTransport(
    servePath: ProcessTransport.defaultServePath, workingDirectory: root))
blast.onEvent = { event in
    if case let .rootView(_, view) = event { draw(view) }
    if case let .view(_, view) = event { draw(view) }
}
_ = try await blast.start(capabilities: ["clipboard.copy"])
_ = try await blast.openExtension(dir: "./my-extension")
let root = try await blast.openRoot(views: .macOS)
try await blast.sendInput(.search("ap"), root: root)
try await blast.sendInput(.primary, root: root)`,
  ndjson: `→ {"type":"hello","protocol":1,"capabilities":["clipboard.copy"],"views":{"platform":"macOS"}}
← {"type":"welcome","protocol":1,"engine":{…},"catalog":{…}}
→ {"type":"request","id":"1","method":"extension.open","params":{"dir":"./my-extension"}}
← {"type":"response","id":"1","ok":true,"result":{"extension":"2"}}
→ {"type":"request","id":"2","method":"root.open","params":{}}
← {"type":"event","event":"root.view","root":"1","view":{"kind":"list","rows":[…]}}
← {"type":"response","id":"2","ok":true,"result":{"root":"1"}}
→ {"type":"request","id":"3","method":"root.input","params":{"root":"1","input":{"type":"primary"}}}
← {"type":"event","event":"root.launched","root":"1","session":"3"}
← {"type":"event","event":"session.view","session":"3","view":{"kind":"list","rows":[…]}}
← {"type":"capability.request","id":"4","session":"3","name":"clipboard.copy","params":{…}}
→ {"type":"capability.result","id":"4","ok":true,"value":null}`,
} as const;

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

export function landing(stats: SiteStats, siteOrigin = "", fetchProxy?: string): string {
  const origin = siteOrigin.replace(/\/$/, "");
  const homeUrl = `${origin}/`;
  const demoUrl = `${origin}/demo/`;
  const embedDemoUrl = `${origin}/demo/?embed=1`;
  const displayDemoUrl = origin ? `${origin.replace(/^https?:\/\//, "")}/demo` : "/demo/";
  const docsUrl = `${origin}/docs/`;
  const quickstartUrl = `${origin}/docs/quickstart/`;

  const jsSnippet = highlightCode(landingSnippets.js, "js");
  const webSnippet = highlightCode(landingSnippets.web, "html");
  const goSnippet = highlightCode(landingSnippets.go, "go");
  const pySnippet = highlightCode(landingSnippets.py, "python");
  const swiftSnippet = highlightCode(landingSnippets.swift, "swift");
  const ndjsonHtml = highlightNdjson(landingSnippets.ndjson);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Blast — Raycast extensions, inside your app</title>
  <meta name="description" content="Embed unmodified Raycast extensions inside your application in any language.">
  ${fontPreloadHtml}
  <script>document.documentElement.classList.add("js");</script>
  <style>
    ${fontFacesCss}
    ${themeTokensCss}

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--ground);
      color: var(--ink);
      font: 15px/1.55 var(--sans);
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    code { font-family: var(--mono); font-size: .9em; }

    ${siteHeaderCss}

    /* Hero */
    .hero {
      position: relative;
      text-align: center;
      padding-block: 56px 72px;
      background-image: radial-gradient(var(--dot) 1px, transparent 1px);
      background-size: 18px 18px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      max-width: 100%;
      font: 12px var(--mono);
      color: var(--muted);
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 999px;
      padding: 4px 12px 4px 6px;
      text-decoration: none;
    }
    .pill:hover { color: var(--ink); }
    .pill b {
      font-weight: 500;
      color: var(--surface);
      background: var(--ink);
      border-radius: 999px;
      padding: 1px 8px;
    }
    h1 {
      font-size: clamp(38px, 6.4vw, 72px);
      line-height: 1;
      letter-spacing: -0.045em;
      font-weight: 600;
      margin: 22px auto 18px;
      max-width: 15ch;
      text-wrap: balance;
    }
    .lede {
      color: var(--muted);
      max-width: 58ch;
      margin: 0 auto 28px;
      font-size: 17px;
      text-wrap: pretty;
    }
    .ctas {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: center;
      margin-bottom: 18px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      height: 40px;
      padding: 0 18px;
      border-radius: 9px;
      font-weight: 500;
      font-size: 14px;
      text-decoration: none;
    }
    .btn-primary { background: var(--ink); color: var(--surface); }
    .btn-ghost { border: 1px solid var(--line); background: var(--surface); }
    .install {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font: 13px var(--mono);
      color: var(--muted);
      max-width: 100%;
    }
    .install code {
      color: var(--ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .copy {
      font: 12px var(--sans);
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--muted);
      border-radius: 6px;
      padding: 2px 8px;
      cursor: pointer;
      flex: none;
    }
    html:not(.js) .copy,
    html:not(.js) .switch { display: none; }

    /* Player */
    .player { max-width: 980px; margin: 48px auto 0; position: relative; }
    .glow {
      position: absolute;
      inset: 10% 6% -4%;
      background: radial-gradient(60% 60% at 50% 40%, rgb(255 99 56 / 22%), transparent 70%);
      filter: blur(40px);
      pointer-events: none;
    }
    .switch {
      display: inline-flex;
      gap: 2px;
      padding: 3px;
      margin-bottom: 16px;
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 10px;
      position: relative;
      z-index: 1;
    }
    .switch button {
      font: 500 13px var(--sans);
      color: var(--muted);
      background: transparent;
      border: 0;
      border-radius: 7px;
      padding: 6px 16px;
      cursor: pointer;
    }
    .switch button[aria-selected="true"] {
      background: var(--ink);
      color: var(--surface);
    }

    .browser {
      position: relative;
      border-radius: 12px;
      overflow: hidden;
      background: var(--surface);
      box-shadow: 0 0 0 1px rgb(0 0 0 / 12%), 0 40px 80px -20px rgb(10 10 20 / 35%);
      text-align: left;
    }
    .chrome {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 14px;
      background: #11111b;
      color: var(--t-muted);
      font: 12px var(--mono);
    }
    .chrome i {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: #45475a;
      display: block;
      flex: none;
    }
    .chrome span {
      flex: 1;
      text-align: center;
      margin-right: 50px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .browser .chrome {
      background: var(--raise);
      color: var(--muted);
      border-bottom: 1px solid var(--line);
    }
    .browser .chrome i { background: var(--line); }
    .browser .chrome span { margin-right: 0; }
    .pop {
      font: 12px var(--sans);
      color: var(--muted);
      text-decoration: none;
      white-space: nowrap;
      flex: none;
    }
    .pop:hover { color: var(--ink); }
    .browser iframe {
      display: block;
      width: 100%;
      height: 620px;
      border: 0;
      background: var(--ground);
    }

    .term {
      position: relative;
      border-radius: 12px;
      overflow: hidden;
      background: var(--t-bg);
      box-shadow: 0 0 0 1px rgb(0 0 0 / 30%), 0 40px 80px -20px rgb(10 10 20 / 45%);
      text-align: left;
    }
    .screen {
      position: relative;
      /* The recording sets the height; the minimum keeps the fallback message framed. */
      min-height: 240px;
      padding: 16px 18px 12px;
      font: clamp(10.5px, 1.45vw, 13.5px)/1.6 var(--mono);
      color: #cdd6f4;
      display: flex;
      flex-direction: column;
    }
    #tui-player {
      flex: 1;
      min-height: 0;
      width: 100%;
      display: flex;
      flex-direction: column;
    }
    .tui-fallback {
      margin: auto;
      padding: 24px;
      color: var(--t-muted);
      font: 13px var(--mono);
      text-align: center;
    }

    .under {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 2px 0;
      font: 12px var(--mono);
      color: var(--muted);
      flex-wrap: wrap;
      text-align: left;
    }
    .proxy-notice { margin: 0; padding: 10px 16px; font-size: 12px; line-height: 1.5; color: var(--muted); text-align: left; }
    .proxy-notice a { text-decoration: underline; text-underline-offset: 3px; }
    .under code { font-size: 12px; }

    /* Technical section */
    .tech { background: var(--surface); border-top: 1px solid var(--line); }
    .tech > .wrap { padding-block: 80px; display: grid; gap: 64px; }
    .kicker { font: 12px var(--mono); color: var(--accent-ink); margin: 0 0 10px; }
    h2 {
      font-size: clamp(26px, 3.2vw, 36px);
      letter-spacing: -0.03em;
      line-height: 1.1;
      font-weight: 600;
      margin: 0 0 12px;
      text-wrap: balance;
    }
    .tech p { color: var(--muted); max-width: 60ch; margin: 0; }
    .flow {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
    }
    .flow > div { padding: 20px 22px; min-width: 0; }
    .flow > div + div { border-left: 1px solid var(--line); }
    .flow h3 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
    .flow p { font-size: 14px; }
    .flow .who {
      font: 11px var(--mono);
      color: var(--muted);
      display: block;
      margin-bottom: 10px;
    }
    .split {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
      gap: 48px;
      align-items: start;
    }
    .split > * { min-width: 0; }
    .tabs { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
    .tabs button {
      font: 500 13px var(--sans);
      color: var(--muted);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 5px 11px;
      cursor: pointer;
    }
    .tabs button[aria-selected="true"] {
      color: var(--ink);
      background: var(--raise);
      border-color: var(--line);
    }
    html:not(.js) .tabs { display: none; }
    html:not(.js) .tab-panel[hidden] { display: block; margin-top: 20px; }
    pre {
      margin: 0;
      background: var(--code-bg);
      color: var(--code-ink);
      border-radius: 10px;
      padding: 16px 18px;
      overflow-x: auto;
      font: 13px/1.65 var(--mono);
    }
    .t-in { color: #89b4fa; }
    .t-out { color: #a6e3a1; }
    .tab-caption {
      margin: 8px 2px 0;
      font: 12px var(--mono);
      color: var(--muted);
    }
    .facts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      margin-top: 28px;
    }
    .facts div { padding: 14px 8px 14px 0; min-width: 0; }
    .facts dt { font: 12px var(--mono); color: var(--muted); }
    .facts dd {
      margin: 2px 0 0;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .inst { display: grid; gap: 8px; margin-top: 24px; }
    .inst div {
      display: flex;
      gap: 16px;
      font: 13px var(--mono);
      border-bottom: 1px solid var(--line);
      padding-bottom: 8px;
      white-space: nowrap;
      overflow-x: auto;
    }
    .inst span { color: var(--muted); width: 13ch; flex: none; }
    .inst-note { margin-top: 14px !important; font-size: 13px; }
    .inst-note a { text-underline-offset: 3px; }

    footer .wrap {
      padding-block: 28px;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      font-size: 13px;
      color: var(--muted);
    }
    .footer-links {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
    }
    .footer-links a { text-decoration: none; }
    .footer-links a:hover { color: var(--ink); }

    @media (max-width: 820px) {
      .split, .flow { grid-template-columns: minmax(0, 1fr); }
      .flow > div + div { border-left: 0; border-top: 1px solid var(--line); }
      .browser iframe { height: 560px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
    }
  </style>
</head>
<body>
  ${siteHeaderHtml({ homeUrl, docsUrl, demoUrl })}

  <main>
    <section class="hero">
      <div class="wrap">
        <a class="pill" href="${escapeAttribute(tmuxRepoUrl)}"><b>3.0.0-alpha.3</b> The tmux palette is out →</a>
        <h1>Raycast extensions, inside your app.</h1>
        <p class="lede">The engine runs the launcher flow (command search, prompts, dependency installs) and each unmodified command in its own process; you draw views and answer the capabilities you grant.</p>
        <div class="ctas">
          <a class="btn btn-primary" href="${escapeAttribute(quickstartUrl)}">Read the quickstart</a>
          <a class="btn btn-ghost" href="${escapeAttribute(demoUrl)}">Try it in the browser</a>
        </div>
        <div class="install"><code id="cmd">set -g @plugin 'BlastLauncher/tmux-blast'</code><button class="copy" id="copy" type="button">Copy</button></div>

        <div class="player">
          <div class="switch" role="tablist" aria-label="Client">
            <button role="tab" id="sw-web" aria-selected="true" aria-controls="view-web" tabindex="0">Browser</button>
            <button role="tab" id="sw-tui" aria-selected="false" aria-controls="view-tui" tabindex="-1">Terminal</button>
          </div>
          <div class="glow" aria-hidden="true"></div>
          <div id="view-web" role="tabpanel" aria-labelledby="sw-web">
            <div class="browser">
              <div class="chrome"><i></i><i></i><i></i><span>${escapeHtml(displayDemoUrl)}</span><a href="${escapeAttribute(demoUrl)}" class="pop">Open full screen ↗</a></div>
              ${proxyNotice(fetchProxy)}
              <iframe src="${escapeAttribute(embedDemoUrl)}" title="Blast browser demo: run Raycast extensions from raycast/extensions in this page" allow="clipboard-read; clipboard-write"></iframe>
            </div>
            <div class="under"><span>Live: unmodified extensions from raycast/extensions, run in a sandboxed iframe in your browser.</span><code>@blastlauncher/web</code></div>
          </div>
          <div id="view-tui" role="tabpanel" aria-labelledby="sw-tui" hidden>
            <div class="term">
              <div class="chrome"><i></i><i></i><i></i><span>tmux · ~/projects/blast</span></div>
              <div class="screen"><div id="tui-player" data-cast="/tui.cast"></div></div>
            </div>
            <div class="under"><span>blast-tui in a tmux popup</span><code>blast-tui</code></div>
          </div>
        </div>
      </div>
    </section>

    <section class="tech">
      <div class="wrap">
        <div>
          <p class="kicker">How it works</p>
          <h2>One engine. Your client draws the views.</h2>
          <p>Each command runs unmodified in its own process. The engine turns its React tree into a serializable view, sends it to your client, and routes input back. Privileged operations reach your app only as capabilities you grant.</p>
        </div>

        <div class="flow">
          <div><span class="who">raycast/extensions</span><h3>Extension</h3><p>An unmodified command, bundled with esbuild, in its own Node.js process.</p></div>
          <div><span class="who">@blastlauncher/engine</span><h3>Engine</h3><p>Root command search, preference and argument prompts, dependency installs, then the command.</p></div>
          <div><span class="who">your app</span><h3>Client</h3><p>Draws <code>root.view</code> and <code>session.view</code>, forwards input, answers capability requests.</p></div>
        </div>

        <div class="split">
          <div>
            <h2>Any language, one protocol.</h2>
            <p>In-process from JavaScript, <code>mount()</code> in a web page, or spawn <code>blast serve</code> and speak NDJSON over stdio from Go, Python or Swift.</p>
            <dl class="facts">
              <div><dt>@raycast/api</dt><dd>${escapeHtml(stats.coverage.percent)}</dd></div>
              <div><dt>rendered</dt><dd>${escapeHtml(stats.rendered.toLocaleString())}</dd></div>
              <div><dt>commands tested</dt><dd>${escapeHtml(stats.commands.toLocaleString())}</dd></div>
            </dl>
            <div class="inst">
              <div><span>JS/TS engine</span>npm install @blastlauncher/engine@next</div>
              <div><span>Any language</span>npx -p @blastlauncher/serve@next blast-serve</div>
              <div><span>Web page</span>npm install @blastlauncher/web@next</div>
            </div>
            <p class="inst-note">Prereleases (<code>3.0.0-alpha.3</code>) are on npm under <code>next</code>; install with <code>@next</code>, not <code>latest</code>. <a href="${escapeAttribute(coverageUrl)}">${stats.coverage.covered} of ${stats.coverage.total} APIs covered</a> · <a href="${escapeAttribute(sweepUrl)}">full sweep</a>.</p>
          </div>
          <div>
            <div class="tabs" role="tablist" aria-label="Integration code examples">
              <button role="tab" aria-selected="true" aria-controls="panel-ndjson" data-tab="ndjson" id="tab-ndjson" tabindex="0">NDJSON</button>
              <button role="tab" aria-selected="false" aria-controls="panel-js" data-tab="js" id="tab-js" tabindex="-1">JavaScript</button>
              <button role="tab" aria-selected="false" aria-controls="panel-web" data-tab="web" id="tab-web" tabindex="-1">Web page</button>
              <button role="tab" aria-selected="false" aria-controls="panel-go" data-tab="go" id="tab-go" tabindex="-1">Go</button>
              <button role="tab" aria-selected="false" aria-controls="panel-py" data-tab="py" id="tab-py" tabindex="-1">Python</button>
              <button role="tab" aria-selected="false" aria-controls="panel-swift" data-tab="swift" id="tab-swift" tabindex="-1">Swift</button>
            </div>
            <div class="tab-panel" id="panel-ndjson" role="tabpanel" aria-labelledby="tab-ndjson">
              <pre><code>${ndjsonHtml}</code></pre>
              <p class="tab-caption">Lines starting with → are what you send, ← what you receive.</p>
            </div>
            <div class="tab-panel" id="panel-js" role="tabpanel" aria-labelledby="tab-js" hidden>
              <pre><code>${jsSnippet}</code></pre>
              <p class="tab-caption">The in-process engine: Node.js, Bun or Electron</p>
            </div>
            <div class="tab-panel" id="panel-web" role="tabpanel" aria-labelledby="tab-web" hidden>
              <pre><code>${webSnippet}</code></pre>
              <p class="tab-caption">@blastlauncher/web: the extension runs in a sandbox on a second origin you host</p>
            </div>
            <div class="tab-panel" id="panel-go" role="tabpanel" aria-labelledby="tab-go" hidden>
              <pre><code>${goSnippet}</code></pre>
              <p class="tab-caption">Client from examples/go-embedder</p>
            </div>
            <div class="tab-panel" id="panel-py" role="tabpanel" aria-labelledby="tab-py" hidden>
              <pre><code>${pySnippet}</code></pre>
              <p class="tab-caption">Standard library only, from examples/python-embedder</p>
            </div>
            <div class="tab-panel" id="panel-swift" role="tabpanel" aria-labelledby="tab-swift" hidden>
              <pre><code>${swiftSnippet}</code></pre>
              <p class="tab-caption">BlastKit from examples/macos-launcher</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="wrap">
      <span>Blast is open source (MIT) and in alpha.</span>
      <nav class="footer-links" aria-label="Footer">
        <a href="${escapeAttribute(docsUrl)}">Docs</a>
        <a href="${escapeAttribute(demoUrl)}">Demo</a>
        <a href="${escapeAttribute(coverageUrl)}">Coverage</a>
        <a href="${escapeAttribute(sweepUrl)}">Sweep</a>
        <a href="${escapeAttribute(repoUrl)}">GitHub</a>
      </nav>
    </div>
  </footer>

  <script>
    const $ = (id) => document.getElementById(id);
    let tuiMod = null;
    let tuiHandle = null;
    function unmountTui() {
      if (tuiHandle && typeof tuiHandle.dispose === "function") tuiHandle.dispose();
      tuiHandle = null;
    }
    async function mountTui() {
      const el = $("tui-player");
      if (!el || tuiHandle) return;
      try {
        if (!tuiMod) tuiMod = await import("/tui-player.js");
        if (!$("view-tui").hidden && !tuiHandle) {
          el.textContent = "";
          tuiHandle = tuiMod.mountTuiPlayer(el, el.dataset.cast || "/tui.cast");
        }
      } catch {
        el.innerHTML = '<div class="tui-fallback">Recording unavailable</div>';
      }
    }
    function showView(which) {
      const tui = which === "tui";
      $("sw-web").setAttribute("aria-selected", String(!tui));
      $("sw-web").tabIndex = tui ? -1 : 0;
      $("sw-tui").setAttribute("aria-selected", String(tui));
      $("sw-tui").tabIndex = tui ? 0 : -1;
      $("view-web").hidden = tui;
      $("view-tui").hidden = !tui;
      if (tui) mountTui();
      else unmountTui();
    }
    function bindTablist(tabs, onSelect) {
      tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => onSelect(tab));
        tab.addEventListener("keydown", (event) => {
          let next = -1;
          if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
          else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = tabs.length - 1;
          if (next < 0) return;
          event.preventDefault();
          tabs[next].focus();
          onSelect(tabs[next]);
        });
      });
    }
    bindTablist([$("sw-web"), $("sw-tui")], (tab) => showView(tab.id === "sw-tui" ? "tui" : "web"));

    const codeTabs = [...document.querySelectorAll(".tabs [role=tab]")];
    function showTab(id) {
      codeTabs.forEach((b) => {
        const active = b.dataset.tab === id;
        b.setAttribute("aria-selected", String(active));
        b.tabIndex = active ? 0 : -1;
        const panel = $("panel-" + b.dataset.tab);
        if (panel) panel.hidden = !active;
      });
    }
    bindTablist(codeTabs, (tab) => showTab(tab.dataset.tab));

    $("copy").addEventListener("click", async () => {
      const cmd = $("cmd");
      try {
        await navigator.clipboard.writeText(cmd.textContent || "");
        $("copy").textContent = "Copied";
      } catch {
        const range = document.createRange();
        range.selectNodeContents(cmd);
        const sel = getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
        $("copy").textContent = "Selected";
      }
      setTimeout(() => ($("copy").textContent = "Copy"), 1500);
    });
  </script>
</body>
</html>
`;
}
