// Landing page for Blast: reference-library aesthetic, CSS-animated engine diagram, pure HTML/CSS.
// Zero external requests, accessible, responsive at 360px, honours dark mode and reduced motion.

export interface SiteStats {
  coverage: { covered: number; total: number; percent: string };
  rendered: number;
  commands: number;
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function landing(stats: SiteStats, siteOrigin = ""): string {
  const origin = siteOrigin.replace(/\/$/, "");
  const demoUrl = `${origin}/demo/`;
  const docsUrl = `${origin}/docs/`;
  const quickstartUrl = `${origin}/docs/quickstart/`;
  const coverageUrl = "https://github.com/blastlauncher/blast/blob/main/compat/COVERAGE.md";
  const sweepUrl = "https://github.com/blastlauncher/blast/blob/main/SWEEP.md";
  const repoUrl = "https://github.com/blastlauncher/blast";

  const jsSnippet = escapeHtml(String.raw`import { createEngine } from "@blastlauncher/engine";

const engine = createEngine({ handlers: { "clipboard.copy": (params) => copy(params) } });
engine.openExtension({ extensionDir: "./my-extension" });
const root = engine.root({ views: { platform: "macOS" } });
root.subscribe((view) => draw(view)); // the command list, prompts, then the command
root.input({ type: "search", text: "ap" });
root.input({ type: "primary" });`);

  const webSnippet = escapeHtml(String.raw`<div id="app"></div>
<script type="module">
  import { mount } from "/blast/blast-web.js";
  mount(document.querySelector("#app"), {
    extension: "raycast/extensions/android-versions",
    sandboxUrl: "https://sandbox.example.com/",
  });
</script>`);

  const goSnippet =
    escapeHtml(String.raw`client, _ := Start("packages/serve/src/main.ts", os.Stdout) // spawns blast serve, views on
defer client.Close()
client.Open("./my-extension")
client.OpenRoot() // root.view events: the command list, drawn as they arrive
client.Input(controllerInput{Type: "search", Text: textPointer("ap")})
client.Input(controllerInput{Type: "primary"}) // root.launched: input goes to the session`);

  const pySnippet =
    escapeHtml(String.raw`from embedder import Client  # spawns blast serve; views on in the hello

client = Client()
client.request("extension.open", {"dir": "./my-extension"})
client.root = client.request("root.open", {})["root"]  # root.view events are drawn
client.input({"type": "search", "text": "ap"})
client.input({"type": "primary"})  # root.launched: input goes to the session
client.shutdown()`);

  const swiftSnippet = escapeHtml(String.raw`let blast = BlastClient(transport: ProcessTransport(
    servePath: ProcessTransport.defaultServePath, workingDirectory: root))
blast.onEvent = { event in
    if case let .rootView(_, view) = event { draw(view) }
    if case let .view(_, view) = event { draw(view) }
}
_ = try await blast.start(capabilities: ["clipboard.copy"])
_ = try await blast.openExtension(dir: "./my-extension")
let root = try await blast.openRoot(views: .macOS)
try await blast.sendInput(.search("ap"), root: root)
try await blast.sendInput(.primary, root: root)`);

  const ndjsonSnippet =
    escapeHtml(String.raw`→ {"type":"hello","protocol":1,"capabilities":["clipboard.copy"],"views":{"platform":"macOS"}}
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
→ {"type":"capability.result","id":"4","ok":true,"value":null}`);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Blast — Raycast extensions, inside your app</title>
  <meta name="description" content="Embed unmodified Raycast extensions inside your application in any language.">
  <link rel="preload" href="/fonts/newsreader-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin>
  <style>
    @font-face {
      font-family: "Newsreader";
      font-style: normal;
      font-weight: 200 800;
      font-display: swap;
      src: url(/fonts/newsreader-latin-opsz-normal.woff2) format("woff2-variations");
      unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
    }
    @font-face {
      font-family: "Newsreader";
      font-style: italic;
      font-weight: 200 800;
      font-display: swap;
      src: url(/fonts/newsreader-latin-opsz-italic.woff2) format("woff2-variations");
      unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
    }
    @font-face {
      font-family: "IBM Plex Mono";
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url(/fonts/ibm-plex-mono-latin-400-normal.woff2) format("woff2");
      unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
    }
    @font-face {
      font-family: "IBM Plex Mono";
      font-style: normal;
      font-weight: 500;
      font-display: swap;
      src: url(/fonts/ibm-plex-mono-latin-500-normal.woff2) format("woff2");
      unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
    }

    :root {
      /* Reference Library: warm rag paper & iron-gall ink */
      --bg: #f7f4ec;
      --paper: #fcfbf7;
      --paper-tinted: #efeae0;
      --ink: #1b1917;
      --ink-muted: #524b44;
      --rule: #d7cfc2;
      --rule-strong: #b6ab99;
      --accent: #8c2318;
      --accent-hover: #6e1a11;
      --accent-soft: #f3e4e1;
      --accent-ink: #fcfbf7;
      --forest: #1f4d3a;
      --brass: #7a5718;
      --code-bg: #1a1816;
      --code-text: #f4efe6;
      --code-muted: #b7aea0;
      --code-border: #36302a;
      --focus-ring: #8c2318;
      --radius: 3px;
      --font-serif: "Newsreader", "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
      --font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        /* Night Reading Room: warm lamp-lit charcoal & parchment */
        --bg: #12110f;
        --paper: #1a1815;
        --paper-tinted: #221f1b;
        --ink: #ede7db;
        --ink-muted: #b4aba0;
        --rule: #2f2a24;
        --rule-strong: #4a4238;
        --accent: #e47b5e;
        --accent-hover: #ee947b;
        --accent-soft: #2c1e1a;
        --accent-ink: #12110f;
        --forest: #74c69d;
        --brass: #d4a955;
        --code-bg: #0c0b0a;
        --code-text: #ede7db;
        --code-muted: #aca294;
        --code-border: #2c2823;
        --focus-ring: #e47b5e;
      }
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      font-family: var(--font-serif);
      font-size: 17px;
      font-optical-sizing: auto;
      font-variant-numeric: oldstyle-nums;
      hanging-punctuation: first allow-end last;
      background-color: var(--bg);
      color: var(--ink);
      line-height: 1.62;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
      max-width: 100vw;
    }

    body {
      min-height: 100vh;
      overflow-x: hidden;
      max-width: 100vw;
      display: flex;
      flex-direction: column;
    }

    a {
      color: var(--accent);
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 0.18em;
    }
    a:hover {
      color: var(--accent-hover);
      text-decoration-thickness: 2px;
    }
    a:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 3px;
      border-radius: 2px;
    }

    code, pre {
      font-family: var(--font-mono);
      font-size: 0.82rem;
    }
    p code, li code, td code {
      background: var(--paper-tinted);
      border: 1px solid var(--rule);
      padding: 0.08em 0.32em;
      border-radius: 2px;
      font-size: 0.84em;
      color: var(--ink);
    }
    pre {
      max-width: 100%;
      overflow-x: auto;
    }

    .container {
      width: 100%;
      max-width: 1080px;
      margin: 0 auto;
      padding: 0 1.25rem;
    }

    main {
      flex: 1 1 auto;
      min-width: 0;
      max-width: 100%;
      overflow-x: hidden;
    }

    .hero-grid > *,
    .manual-grid > *,
    .diagram-canvas > *,
    .tab-group,
    .tab-panels,
    .plate {
      min-width: 0;
      max-width: 100%;
    }

    /* Header / Masthead */
    header {
      background: var(--bg);
      border-bottom: 1px solid var(--rule-strong);
      padding: 1rem 0;
    }
    .header-inner {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.65rem 1.5rem;
    }
    .brand {
      font-family: var(--font-serif);
      font-weight: 600;
      font-size: 1.5rem;
      letter-spacing: -0.02em;
      color: var(--ink);
      text-decoration: none;
    }
    .brand:hover {
      color: var(--ink);
      text-decoration: none;
    }
    .nav-links {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.5rem 1.35rem;
      font-size: 0.92rem;
      font-variant-caps: all-small-caps;
      letter-spacing: 0.06em;
    }
    .nav-links a {
      color: var(--ink-muted);
      text-decoration: none;
      border-bottom: 1px solid transparent;
      padding: 0.1rem 0;
    }
    .nav-links a:hover {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    /* Restrained Actions */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.55rem 1.15rem;
      border-radius: 2px;
      font-family: var(--font-serif);
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
    }
    .btn-primary {
      background-color: var(--accent);
      color: var(--accent-ink);
      border: 1px solid var(--accent);
    }
    .btn-primary:hover {
      background-color: var(--accent-hover);
      border-color: var(--accent-hover);
      color: var(--accent-ink);
      text-decoration: none;
    }
    .link-ruled {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-family: var(--font-serif);
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--accent);
      text-decoration: none;
      border-bottom: 1px solid var(--accent);
      padding: 0.2rem 0;
    }
    .link-ruled:hover {
      color: var(--accent-hover);
      border-bottom-width: 2px;
      text-decoration: none;
    }

    /* Hero */
    .hero {
      padding: 2.5rem 0 3rem;
      border-bottom: 3px double var(--rule-strong);
    }
    .hero-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 2.25rem;
      align-items: center;
    }
    @media (min-width: 920px) {
      .hero {
        padding: 3.25rem 0 3.75rem;
      }
      .hero-grid {
        grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
        gap: 2.75rem;
      }
    }
    .hero-content h1 {
      font-family: var(--font-serif);
      font-size: clamp(2.1rem, 4.6vw, 3.1rem);
      line-height: 1.08;
      font-weight: 600;
      letter-spacing: -0.025em;
      margin-bottom: 1.15rem;
      color: var(--ink);
    }
    .hero-content p {
      font-size: 1.05rem;
      color: var(--ink-muted);
      line-height: 1.65;
      margin-bottom: 1.75rem;
      max-width: 48ch;
    }
    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.85rem 1.5rem;
    }

    /* Plate I: Animated Engine -> Hosts Diagram */
    .plate {
      background: var(--paper);
      border: 1px solid var(--rule-strong);
      border-radius: var(--radius);
      padding: 0.9rem;
    }
    .plate-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.4rem 0.75rem;
      padding-bottom: 0.55rem;
      margin-bottom: 0.85rem;
      border-bottom: 1px solid var(--rule);
    }
    .plate-num {
      font-family: var(--font-serif);
      font-variant-caps: all-small-caps;
      letter-spacing: 0.08em;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--accent);
    }
    .plate-title {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: var(--ink-muted);
    }

    .diagram-canvas {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.65rem;
      padding-left: 1.5rem;
    }
    /* Mobile vertical rail connecting macOS -> Engine -> 3 other hosts */
    .mobile-rail {
      position: absolute;
      left: 0.5rem;
      top: 5.45rem;
      bottom: 5.45rem;
      width: 1px;
      background: var(--rule-strong);
      pointer-events: none;
    }
    .mobile-rail-packet {
      position: absolute;
      left: -3.5px;
      width: 8px;
      height: 8px;
      border-radius: 2px;
      border: 1px solid var(--paper);
      transform: translateY(-50%);
      pointer-events: none;
      opacity: 0;
    }
    .mobile-packet-in {
      background: var(--ink);
      animation: mobile-in 9s ease-in-out infinite;
    }
    .mobile-packet-out {
      background: var(--accent);
      animation: mobile-out 9s ease-in-out infinite;
    }

    .engine-hub {
      order: 2;
      position: relative;
      background: var(--code-bg);
      color: var(--code-text);
      border: 1px solid var(--code-border);
      border-radius: 3px;
      padding: 0.58rem 0.9rem;
      text-align: center;
      animation: engine-react 9s linear infinite;
    }
    .engine-hub::before {
      content: "";
      position: absolute;
      left: -1rem;
      top: 50%;
      width: 1rem;
      height: 1px;
      background: var(--accent);
    }
    .engine-hub-title {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-family: var(--font-serif);
      font-weight: 600;
      font-size: 0.92rem;
      letter-spacing: 0.01em;
    }
    .engine-stamp {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.1rem;
      height: 1.1rem;
      border: 1px solid var(--code-muted);
      border-radius: 2px;
      font-family: var(--font-mono);
      font-size: 0.65rem;
      line-height: 1;
      color: var(--code-muted);
      animation: stamp-tick 9s linear infinite;
    }
    .engine-hub-sub {
      margin-top: 0.15rem;
      font-family: var(--font-mono);
      font-size: 0.66rem;
      color: var(--code-muted);
    }

    .bus-svg {
      display: none;
    }

    .host-shell {
      position: relative;
      background: var(--bg);
      border: 1px solid var(--rule-strong);
      border-radius: 3px;
      padding: 0.52rem 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.36rem;
    }
    .host-shell::before {
      content: "";
      position: absolute;
      left: -1rem;
      top: 50%;
      width: 1rem;
      height: 1px;
      background: var(--rule-strong);
    }
    .host-macos { order: 1; }
    .host-tmux { order: 3; }
    .host-web { order: 4; }
    .host-stdio { order: 5; }

    .host-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.4rem;
      border-bottom: 1px solid var(--rule);
      padding-bottom: 0.25rem;
    }
    .host-name {
      font-family: var(--font-serif);
      font-weight: 600;
      font-size: 0.85rem;
      color: var(--ink);
    }
    .host-kind {
      font-family: var(--font-mono);
      font-size: 0.66rem;
      color: var(--accent);
      white-space: nowrap;
    }
    .host-sub {
      font-family: var(--font-mono);
      font-size: 0.66rem;
      color: var(--ink-muted);
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .host-sub code {
      font-size: 0.66rem;
      padding: 0 0.2em;
    }

    /* Host 1: macOS native rounded idiom */
    .idiom-macos {
      background: var(--paper);
      border: 1px solid var(--rule-strong);
      border-radius: 6px;
      padding: 0.35rem;
      height: 6.45rem;
      overflow: hidden;
    }
    .macos-search {
      position: relative;
      display: flex;
      align-items: center;
      height: 1.45rem;
      padding: 0 0.4rem;
      margin-bottom: 0.28rem;
      border: 1px solid var(--rule);
      border-radius: 4px;
      background: var(--bg);
      font-family: var(--font-mono);
      font-size: 0.68rem;
      color: var(--ink);
    }
    .macos-placeholder {
      position: absolute;
      left: 0.62rem;
      color: var(--ink-muted);
      animation: macos-placeholder 9s linear infinite;
    }
    .macos-typed {
      display: inline-block;
      overflow: hidden;
      white-space: nowrap;
      width: 0ch;
      animation: macos-type 9s steps(2, end) infinite;
    }
    .macos-caret {
      display: inline-block;
      width: 1.5px;
      height: 0.85em;
      background: var(--accent);
      margin-left: 1px;
      animation: caret-blink 0.9s steps(1, end) infinite;
    }
    .macos-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.12rem;
    }
    .macos-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 0.7rem;
      line-height: 1.25;
      padding: 0.18rem 0.38rem;
      border-radius: 4px;
      color: var(--ink-muted);
      overflow: hidden;
      max-height: 1.7rem;
    }
    .macos-row.row-apple {
      animation: row-select-pill-1 9s linear infinite;
    }
    .macos-row .row-return {
      opacity: 0;
      font-size: 0.64rem;
      animation: row-return-1 9s linear infinite;
    }
    .macos-row.row-collapse {
      animation: row-collapse-1 9s linear infinite;
    }

    /* Host 2: Terminal / tmux monospace box-drawing idiom */
    .idiom-tui {
      background: var(--paper);
      border: 1px solid var(--ink);
      border-radius: 0;
      padding: 0.3rem 0.36rem;
      font-family: var(--font-mono);
      font-size: 0.67rem;
      line-height: 1.32;
      height: 6.45rem;
      overflow: hidden;
    }
    .tui-bar {
      color: var(--ink-muted);
      white-space: nowrap;
      overflow: hidden;
      margin-bottom: 0.16rem;
    }
    .tui-rows {
      list-style: none;
      display: flex;
      flex-direction: column;
    }
    .tui-row {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.08rem 0.2rem;
      color: var(--ink-muted);
      overflow: hidden;
      max-height: 1.5rem;
    }
    .tui-marker {
      visibility: hidden;
      color: var(--accent);
      font-weight: 700;
    }
    .tui-row.row-apple {
      animation: row-select-tui-2 9s linear infinite;
    }
    .tui-row.row-apple .tui-marker {
      animation: marker-show-2 9s linear infinite;
    }
    .tui-row.row-collapse {
      animation: row-collapse-2 9s linear infinite;
    }

    /* Host 3: Web page plain DOM list idiom */
    .idiom-web {
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 0;
      padding: 0.32rem 0.4rem;
      height: 6.45rem;
      overflow: hidden;
    }
    .web-dom-tag {
      font-family: var(--font-mono);
      font-size: 0.62rem;
      color: var(--ink-muted);
      border-bottom: 1px solid var(--rule);
      padding-bottom: 0.14rem;
      margin-bottom: 0.2rem;
    }
    .web-list {
      list-style: disc inside;
      display: flex;
      flex-direction: column;
      gap: 0.08rem;
      font-family: var(--font-serif);
      font-size: 0.74rem;
      line-height: 1.3;
    }
    .web-row {
      padding: 0.06rem 0.22rem;
      color: var(--ink-muted);
      overflow: hidden;
      max-height: 1.5rem;
    }
    .web-row.row-apple {
      animation: row-select-web-3 9s linear infinite;
    }
    .web-row.row-collapse {
      animation: row-collapse-3 9s linear infinite;
    }

    /* Host 4: Go / Python raw NDJSON line typing out */
    .idiom-ndjson {
      background: var(--code-bg);
      color: var(--code-text);
      border: 1px solid var(--code-border);
      border-radius: 2px;
      padding: 0.36rem 0.42rem;
      font-family: var(--font-mono);
      font-size: 0.54rem;
      line-height: 1.48;
      overflow: hidden;
      height: 6.45rem;
    }
    .ndjson-prompt {
      font-size: 0.56rem;
      color: var(--code-muted);
      white-space: nowrap;
      overflow: hidden;
      margin-bottom: 0.14rem;
    }
    .idiom-ndjson .ndjson-line {
      display: block;
      font-size: 0.53rem;
      white-space: nowrap;
      overflow: hidden;
      width: 0;
      color: var(--code-text);
    }
    .ndjson-line-1 {
      animation: ndjson-type-1 9s steps(28, end) infinite;
    }
    .ndjson-line-2 {
      animation: ndjson-type-2 9s steps(33, end) infinite;
    }

    @media (min-width: 520px) {
      .diagram-canvas {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 0 0.85rem;
        padding-left: 0;
      }
      .mobile-rail,
      .mobile-rail-packet,
      .engine-hub::before,
      .host-shell::before {
        display: none;
      }
      .host-macos { order: 1; }
      .host-tmux { order: 2; }
      .bus-top {
        display: block;
        order: 3;
        grid-column: 1 / -1;
        width: 100%;
        height: auto;
        aspect-ratio: 520 / 52;
        overflow: visible;
      }
      .engine-hub {
        order: 4;
        grid-column: 1 / -1;
        justify-self: center;
        min-width: 235px;
      }
      .bus-bottom {
        display: block;
        order: 5;
        grid-column: 1 / -1;
        width: 100%;
        height: auto;
        aspect-ratio: 520 / 52;
        overflow: visible;
      }
      .host-web { order: 6; }
      .host-stdio { order: 7; }
    }

    .bus-track {
      fill: none;
      stroke: var(--rule-strong);
      stroke-width: 1.25;
    }
    .bus-wire-active {
      fill: none;
      stroke: var(--accent);
      stroke-width: 1.5;
      opacity: 0;
    }
    .wire-in {
      animation: wire-in-glow 9s linear infinite;
    }
    .wire-out {
      animation: wire-out-glow 9s linear infinite;
    }
    .bus-arrow {
      fill: var(--rule-strong);
    }
    .packet-pill-in rect {
      fill: var(--paper);
      stroke: var(--ink);
      stroke-width: 1;
    }
    .packet-pill-in text {
      fill: var(--ink);
      font-family: var(--font-mono);
      font-size: 8.5px;
      font-weight: 500;
      text-anchor: middle;
    }
    .packet-pill-view rect {
      fill: var(--accent);
    }
    .packet-pill-view text {
      fill: var(--accent-ink);
      font-family: var(--font-mono);
      font-size: 8.5px;
      font-weight: 500;
      text-anchor: middle;
    }
    .packet-input {
      opacity: 0;
      animation: send-input 9s linear infinite;
    }
    .packet-v-tl {
      opacity: 0;
      animation: fan-tl 9s linear infinite;
    }
    .packet-v-tr {
      opacity: 0;
      animation: fan-tr 9s linear infinite;
    }
    .packet-v-bl {
      opacity: 0;
      animation: fan-bl 9s linear infinite;
    }
    .packet-v-br {
      opacity: 0;
      animation: fan-br 9s linear infinite;
    }

    /* Keyframes: 9s loop telling input -> reconcile -> fan-out -> native redraw */
    @keyframes macos-placeholder {
      0%, 5% { opacity: 1; }
      7%, 91% { opacity: 0; }
      95%, 100% { opacity: 1; }
    }
    @keyframes macos-type {
      0%, 6% { width: 0ch; }
      17%, 90% { width: 2ch; }
      94%, 100% { width: 0ch; }
    }
    @keyframes caret-blink {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }

    @keyframes wire-in-glow {
      0%, 16% { opacity: 0; }
      20%, 31% { opacity: 0.9; }
      35%, 100% { opacity: 0; }
    }
    @keyframes wire-out-glow {
      0%, 37% { opacity: 0; }
      40%, 60% { opacity: 0.9; }
      65%, 100% { opacity: 0; }
    }

    @keyframes send-input {
      0%, 17% { transform: translate(126px, 5px); opacity: 0; }
      19% { transform: translate(126px, 5px); opacity: 1; }
      23% { transform: translate(126px, 26px); opacity: 1; }
      28% { transform: translate(260px, 26px); opacity: 1; }
      32% { transform: translate(260px, 47px); opacity: 0; }
      100% { transform: translate(260px, 47px); opacity: 0; }
    }

    @keyframes engine-react {
      0%, 30% { border-color: var(--code-border); }
      32%, 41% { border-color: var(--accent); }
      45%, 100% { border-color: var(--code-border); }
    }
    @keyframes stamp-tick {
      0%, 30% {
        color: var(--code-muted);
        border-color: var(--code-muted);
        transform: scale(1);
      }
      33% {
        color: var(--accent);
        border-color: var(--accent);
        transform: scale(1.22) rotate(-6deg);
      }
      36%, 89% {
        color: var(--accent);
        border-color: var(--accent);
        transform: scale(1) rotate(0deg);
      }
      94%, 100% {
        color: var(--code-muted);
        border-color: var(--code-muted);
        transform: scale(1);
      }
    }

    @keyframes fan-tl {
      0%, 37% { transform: translate(260px, 47px); opacity: 0; }
      39% { transform: translate(260px, 47px); opacity: 1; }
      43% { transform: translate(260px, 26px); opacity: 1; }
      47% { transform: translate(126px, 26px); opacity: 1; }
      50% { transform: translate(126px, 5px); opacity: 0; }
      100% { transform: translate(126px, 5px); opacity: 0; }
    }
    @keyframes fan-tr {
      0%, 40% { transform: translate(260px, 47px); opacity: 0; }
      42% { transform: translate(260px, 47px); opacity: 1; }
      46% { transform: translate(260px, 26px); opacity: 1; }
      50% { transform: translate(394px, 26px); opacity: 1; }
      53% { transform: translate(394px, 5px); opacity: 0; }
      100% { transform: translate(394px, 5px); opacity: 0; }
    }
    @keyframes fan-bl {
      0%, 43% { transform: translate(260px, 5px); opacity: 0; }
      45% { transform: translate(260px, 5px); opacity: 1; }
      49% { transform: translate(260px, 26px); opacity: 1; }
      53% { transform: translate(126px, 26px); opacity: 1; }
      56% { transform: translate(126px, 47px); opacity: 0; }
      100% { transform: translate(126px, 47px); opacity: 0; }
    }
    @keyframes fan-br {
      0%, 46% { transform: translate(260px, 5px); opacity: 0; }
      48% { transform: translate(260px, 5px); opacity: 1; }
      52% { transform: translate(260px, 26px); opacity: 1; }
      56% { transform: translate(394px, 26px); opacity: 1; }
      59% { transform: translate(394px, 47px); opacity: 0; }
      100% { transform: translate(394px, 47px); opacity: 0; }
    }

    @keyframes mobile-in {
      0%, 17% { top: 0%; opacity: 0; }
      19% { top: 0%; opacity: 1; }
      31% { top: 22%; opacity: 1; }
      33%, 100% { top: 22%; opacity: 0; }
    }
    @keyframes mobile-out {
      0%, 38% { top: 22%; opacity: 0; }
      40% { top: 22%; opacity: 1; }
      58% { top: 100%; opacity: 1; }
      60%, 100% { top: 100%; opacity: 0; }
    }

    /* Host redraw keyframes (staggered at 49%, 52%, 55%, 58%) */
    @keyframes row-collapse-1 {
      0%, 48% { max-height: 1.7rem; opacity: 1; padding-top: 0.18rem; padding-bottom: 0.18rem; }
      52%, 89% { max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; }
      95%, 100% { max-height: 1.7rem; opacity: 1; padding-top: 0.18rem; padding-bottom: 0.18rem; }
    }
    @keyframes row-select-pill-1 {
      0%, 48% { background: transparent; color: var(--ink-muted); font-weight: 400; }
      51%, 89% { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
      95%, 100% { background: transparent; color: var(--ink-muted); font-weight: 400; }
    }
    @keyframes row-return-1 {
      0%, 48% { opacity: 0; }
      51%, 89% { opacity: 1; }
      95%, 100% { opacity: 0; }
    }

    @keyframes row-collapse-2 {
      0%, 51% { max-height: 1.5rem; opacity: 1; padding-top: 0.08rem; padding-bottom: 0.08rem; }
      55%, 89% { max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; }
      95%, 100% { max-height: 1.5rem; opacity: 1; padding-top: 0.08rem; padding-bottom: 0.08rem; }
    }
    @keyframes row-select-tui-2 {
      0%, 51% { background: transparent; color: var(--ink-muted); font-weight: 400; }
      54%, 89% { background: var(--paper-tinted); color: var(--ink); font-weight: 600; }
      95%, 100% { background: transparent; color: var(--ink-muted); font-weight: 400; }
    }
    @keyframes marker-show-2 {
      0%, 51% { visibility: hidden; }
      54%, 89% { visibility: visible; }
      95%, 100% { visibility: hidden; }
    }

    @keyframes row-collapse-3 {
      0%, 54% { max-height: 1.5rem; opacity: 1; padding-top: 0.06rem; padding-bottom: 0.06rem; }
      58%, 89% { max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; }
      95%, 100% { max-height: 1.5rem; opacity: 1; padding-top: 0.06rem; padding-bottom: 0.06rem; }
    }
    @keyframes row-select-web-3 {
      0%, 54% { color: var(--ink-muted); font-weight: 400; text-decoration: none; }
      57%, 89% { color: var(--ink); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
      95%, 100% { color: var(--ink-muted); font-weight: 400; text-decoration: none; }
    }

    @keyframes ndjson-type-1 {
      0%, 57% { width: 0ch; }
      62%, 89% { width: 28ch; }
      95%, 100% { width: 0ch; }
    }
    @keyframes ndjson-type-2 {
      0%, 62% { width: 0ch; }
      68%, 89% { width: 33ch; }
      95%, 100% { width: 0ch; }
    }

    @media (prefers-reduced-motion: reduce) {
      .macos-placeholder,
      .macos-typed,
      .macos-caret,
      .wire-in,
      .wire-out,
      .packet-input,
      .packet-v-tl,
      .packet-v-tr,
      .packet-v-bl,
      .packet-v-br,
      .engine-hub,
      .engine-stamp,
      .macos-row,
      .macos-row .row-return,
      .tui-row,
      .tui-marker,
      .web-row,
      .ndjson-line-1,
      .ndjson-line-2,
      .mobile-rail-packet {
        animation: none;
      }
      .packet-input,
      .packet-v-tl,
      .packet-v-tr,
      .packet-v-bl,
      .packet-v-br,
      .mobile-rail-packet {
        display: none;
      }
      .macos-placeholder {
        display: none;
      }
      .macos-typed {
        width: 2ch;
      }
      .engine-stamp {
        color: var(--accent);
        border-color: var(--accent);
      }
      .macos-row.row-collapse,
      .tui-row.row-collapse,
      .web-row.row-collapse {
        max-height: 0;
        opacity: 0;
        padding-top: 0;
        padding-bottom: 0;
      }
      .macos-row.row-apple {
        background: var(--accent);
        color: var(--accent-ink);
        font-weight: 600;
      }
      .macos-row .row-return {
        opacity: 1;
      }
      .tui-row.row-apple {
        background: var(--paper-tinted);
        color: var(--ink);
        font-weight: 600;
      }
      .tui-row.row-apple .tui-marker {
        visibility: visible;
      }
      .web-row.row-apple {
        color: var(--ink);
        font-weight: 600;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .idiom-ndjson .ndjson-line-1 {
        width: 28ch;
      }
      .idiom-ndjson .ndjson-line-2 {
        width: 33ch;
      }
    }

    /* Manual Layout: Single 66ch column + sparse margin column */
    section.manual-section {
      padding: 2.75rem 0;
      border-bottom: 1px solid var(--rule);
      min-width: 0;
      max-width: 100%;
    }
    .manual-grid {
      display: grid;
      grid-template-columns: minmax(0, 66ch);
      gap: 1.35rem 2.75rem;
    }
    @media (min-width: 960px) {
      section.manual-section {
        padding: 3.1rem 0;
      }
      .manual-grid {
        grid-template-columns: minmax(0, 66ch) minmax(13rem, 1fr);
        align-items: start;
      }
      .manual-main {
        grid-column: 1;
      }
      .marginalia {
        grid-column: 2;
        margin-top: 0.45rem;
      }
    }
    .section-title {
      font-family: var(--font-serif);
      font-size: clamp(1.42rem, 2.7vw, 1.8rem);
      font-weight: 600;
      letter-spacing: -0.015em;
      line-height: 1.2;
      margin-bottom: 0.6rem;
      color: var(--ink);
    }
    .section-num {
      font-variant-numeric: lining-nums tabular-nums;
      font-weight: 400;
      color: var(--ink-muted);
      margin-right: 0.35rem;
    }
    .section-desc {
      font-size: 1rem;
      color: var(--ink-muted);
      max-width: 64ch;
      margin-bottom: 1.45rem;
    }
    .marginalia {
      border-left: 1px solid var(--rule-strong);
      padding-left: 0.9rem;
      font-family: var(--font-serif);
      font-style: italic;
      font-size: 0.875rem;
      line-height: 1.5;
      color: var(--ink-muted);
      max-width: 28ch;
    }

    /* Tabs (Pure CSS, neutral ink active rule) */
    .tab-group {
      border: 1px solid var(--rule-strong);
      border-radius: 2px;
      background: var(--paper);
      overflow: hidden;
    }
    .tab-radio {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
      pointer-events: none;
    }
    .tab-nav {
      display: flex;
      background: var(--paper-tinted);
      border-bottom: 1px solid var(--rule-strong);
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .tab-nav label {
      display: inline-block;
      padding: 0.62rem 1rem;
      font-family: var(--font-serif);
      font-size: 0.92rem;
      font-weight: 500;
      color: var(--ink-muted);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      border-right: 1px solid var(--rule);
      white-space: nowrap;
    }
    .tab-nav label:hover {
      color: var(--ink);
      background: var(--paper);
    }

    #tab-js:checked ~ .tab-nav label[for="tab-js"],
    #tab-web:checked ~ .tab-nav label[for="tab-web"],
    #tab-go:checked ~ .tab-nav label[for="tab-go"],
    #tab-py:checked ~ .tab-nav label[for="tab-py"],
    #tab-swift:checked ~ .tab-nav label[for="tab-swift"],
    #tab-ndjson:checked ~ .tab-nav label[for="tab-ndjson"] {
      color: var(--ink);
      font-weight: 600;
      border-bottom-color: var(--ink);
      background: var(--paper);
    }

    #tab-js:focus-visible ~ .tab-nav label[for="tab-js"],
    #tab-web:focus-visible ~ .tab-nav label[for="tab-web"],
    #tab-go:focus-visible ~ .tab-nav label[for="tab-go"],
    #tab-py:focus-visible ~ .tab-nav label[for="tab-py"],
    #tab-swift:focus-visible ~ .tab-nav label[for="tab-swift"],
    #tab-ndjson:focus-visible ~ .tab-nav label[for="tab-ndjson"] {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }

    .tab-panels .tab-panel {
      display: none;
      padding: 1.15rem 1.25rem;
      background: var(--code-bg);
      color: var(--code-text);
      overflow-x: auto;
    }
    .tab-panels pre {
      line-height: 1.56;
      font-size: 0.81rem;
    }
    .tab-panels .tab-caption {
      margin-top: 0.9rem;
      padding-top: 0.7rem;
      border-top: 1px solid var(--code-border);
      font-size: 0.82rem;
      color: var(--code-muted);
    }

    #tab-js:checked ~ .tab-panels .panel-js,
    #tab-web:checked ~ .tab-panels .panel-web,
    #tab-go:checked ~ .tab-panels .panel-go,
    #tab-py:checked ~ .tab-panels .panel-py,
    #tab-swift:checked ~ .tab-panels .panel-swift,
    #tab-ndjson:checked ~ .tab-panels .panel-ndjson {
      display: block;
    }

    /* Ruled Tables */
    .ruled-table {
      width: 100%;
      border-collapse: collapse;
      font-variant-numeric: lining-nums tabular-nums;
      margin-top: 0.95rem;
    }
    .ruled-table th {
      text-align: left;
      font-family: var(--font-serif);
      font-variant-caps: all-small-caps;
      letter-spacing: 0.06em;
      font-weight: 600;
      font-size: 0.88rem;
      color: var(--ink-muted);
      padding: 0.45rem 0.9rem 0.5rem 0;
      border-top: 1px solid var(--rule-strong);
      border-bottom: 1px solid var(--rule-strong);
      vertical-align: bottom;
    }
    .ruled-table td {
      padding: 0.75rem 0.9rem 0.75rem 0;
      border-bottom: 1px solid var(--rule);
      vertical-align: top;
      font-size: 0.94rem;
      line-height: 1.52;
      color: var(--ink-muted);
    }
    .ruled-table th:last-child,
    .ruled-table td:last-child {
      padding-right: 0;
    }
    .ruled-table tbody tr:last-child td {
      border-bottom-color: var(--rule-strong);
    }
    .ruled-table td strong,
    .ruled-table .col-host {
      color: var(--ink);
      font-weight: 600;
    }
    .ruled-table .col-transport {
      font-family: var(--font-mono);
      font-size: 0.78rem;
      color: var(--ink);
      white-space: nowrap;
    }
    .ruled-table .col-link {
      white-space: nowrap;
    }

    @media (max-width: 639px) {
      .ruled-table thead {
        display: none;
      }
      .ruled-table,
      .ruled-table tbody,
      .ruled-table tr,
      .ruled-table td {
        display: block;
        width: 100%;
      }
      .ruled-table tr {
        padding: 0.7rem 0;
        border-top: 1px solid var(--rule);
      }
      .ruled-table tr:first-child {
        border-top: 1px solid var(--rule-strong);
      }
      .ruled-table tr:last-child {
        border-bottom: 1px solid var(--rule-strong);
      }
      .ruled-table td {
        border-bottom: none;
        padding: 0.18rem 0;
      }
      .ruled-table.boundary-table td[data-label]::before {
        content: attr(data-label) ": ";
        font-variant-caps: all-small-caps;
        letter-spacing: 0.05em;
        font-weight: 600;
        color: var(--ink);
      }
    }

    /* Receipts / Ledger Row */
    .ledger-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      border-top: 1px solid var(--rule-strong);
      border-bottom: 1px solid var(--rule-strong);
      margin-top: 0.95rem;
      margin-bottom: 0.85rem;
    }
    .ledger-cell {
      padding: 0.9rem 0;
      border-bottom: 1px solid var(--rule);
    }
    .ledger-cell:last-child {
      border-bottom: none;
    }
    @media (min-width: 600px) {
      .ledger-row {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .ledger-cell {
        padding: 0.95rem 1rem 0.95rem 0;
        border-bottom: none;
        border-right: 1px solid var(--rule);
      }
      .ledger-cell + .ledger-cell {
        padding-left: 1rem;
      }
      .ledger-cell:last-child {
        border-right: none;
        padding-right: 0;
      }
    }
    .ledger-num {
      font-family: var(--font-serif);
      font-variant-numeric: lining-nums tabular-nums;
      font-size: 1.75rem;
      font-weight: 600;
      line-height: 1.12;
      color: var(--ink);
      margin-bottom: 0.25rem;
    }
    .ledger-label {
      font-size: 0.875rem;
      color: var(--ink-muted);
      line-height: 1.4;
    }
    .ledger-note {
      font-size: 0.875rem;
      color: var(--ink-muted);
      font-style: italic;
    }

    /* Install: plain code lines */
    .install-list {
      margin-top: 1.25rem;
      border-top: 1px solid var(--rule-strong);
    }
    .install-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.25rem 1.25rem;
      padding: 0.72rem 0;
      border-bottom: 1px solid var(--rule);
      align-items: baseline;
    }
    .install-item:last-child {
      border-bottom-color: var(--rule-strong);
    }
    @media (min-width: 600px) {
      .install-item {
        grid-template-columns: 12rem minmax(0, 1fr);
      }
    }
    .install-item dt {
      font-family: var(--font-serif);
      font-variant-caps: all-small-caps;
      letter-spacing: 0.06em;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--ink-muted);
    }
    .install-item dd {
      min-width: 0;
    }
    .install-code {
      display: inline-block;
      max-width: 100%;
      font-family: var(--font-mono);
      font-size: 0.84rem;
      color: var(--ink);
      user-select: all;
      overflow-wrap: anywhere;
    }

    /* Footer */
    footer {
      padding: 2rem 0;
      background: var(--bg);
      border-top: 3px double var(--rule-strong);
      font-size: 0.875rem;
      color: var(--ink-muted);
      margin-top: auto;
    }
    .footer-inner {
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      align-items: flex-start;
      justify-content: space-between;
    }
    .footer-colophon {
      font-family: var(--font-serif);
      font-style: italic;
    }
    @media (min-width: 680px) {
      .footer-inner {
        flex-direction: row;
        align-items: baseline;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="container header-inner">
      <a href="${origin}/" class="brand">Blast</a>
      <nav class="nav-links" aria-label="Main Navigation">
        <a href="${docsUrl}">Docs</a>
        <a href="${quickstartUrl}">Quickstart</a>
        <a href="${demoUrl}">Live Demo</a>
        <a href="${repoUrl}">GitHub</a>
      </nav>
    </div>
  </header>

  <main>
    <!-- Hero -->
    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-content">
          <h1>Raycast extensions, inside your app.</h1>
          <p>The engine runs the launcher flow (command search, prompts, dependency installs) and each unmodified command in its own process; you draw views and answer the capabilities you grant.</p>
          <div class="hero-actions">
            <a href="${demoUrl}" class="btn btn-primary">Try the live demo</a>
            <a href="${quickstartUrl}" class="link-ruled">Quickstart &rarr;</a>
          </div>
        </div>
        <div class="hero-media">
          <figure class="plate" aria-label="Diagram showing a user typing ap in the macOS host, sending root.input to Blast's engine, which stamps and fans root.view out to all four host shells — macOS app, Terminal / tmux, Web page, and Go / Python — each redrawing the filtered result in its own idiom.">
            <figcaption class="plate-header">
              <span class="plate-num">Plate I &middot; Architecture</span>
              <span class="plate-title">root.input &rarr; Engine &rarr; root.view</span>
            </figcaption>
            <div class="diagram-canvas">
              <div class="mobile-rail" aria-hidden="true">
                <span class="mobile-rail-packet mobile-packet-in"></span>
                <span class="mobile-rail-packet mobile-packet-out"></span>
              </div>

              <div class="host-shell host-macos">
                <div class="host-head">
                  <span class="host-name">macOS app</span>
                  <span class="host-kind">Swift</span>
                </div>
                <div class="host-sub"><code>examples/macos-launcher</code>, BlastKit</div>
                <div class="idiom-macos" aria-hidden="true">
                  <div class="macos-search">
                    <span class="macos-placeholder">Search&hellip;</span>
                    <span class="macos-typed">ap</span><span class="macos-caret"></span>
                  </div>
                  <ul class="macos-list">
                    <li class="macos-row row-apple"><span>Apple</span><span class="row-return">&crarr;</span></li>
                    <li class="macos-row row-collapse"><span>Banana</span></li>
                    <li class="macos-row row-collapse"><span>Cherry</span></li>
                  </ul>
                </div>
              </div>

              <div class="host-shell host-tmux">
                <div class="host-head">
                  <span class="host-name">Terminal / tmux</span>
                  <span class="host-kind">TUI</span>
                </div>
                <div class="host-sub"><code>blast-tui</code></div>
                <div class="idiom-tui" aria-hidden="true">
                  <div class="tui-bar">&#9484;&#9472; root.view &#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9488;</div>
                  <ul class="tui-rows">
                    <li class="tui-row row-apple"><span class="tui-marker">&rsaquo;</span><span>Apple</span></li>
                    <li class="tui-row row-collapse"><span class="tui-marker">&nbsp;</span><span>Banana</span></li>
                    <li class="tui-row row-collapse"><span class="tui-marker">&nbsp;</span><span>Cherry</span></li>
                  </ul>
                </div>
              </div>

              <svg class="bus-svg bus-top" viewBox="0 0 520 52" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <path class="bus-track" d="M 260 52 L 260 26 L 126 26 L 126 4" vector-effect="non-scaling-stroke" />
                <path class="bus-track" d="M 260 52 L 260 26 L 394 26 L 394 4" vector-effect="non-scaling-stroke" />
                <path class="bus-wire-active wire-in" d="M 126 4 L 126 26 L 260 26 L 260 52" vector-effect="non-scaling-stroke" />
                <path class="bus-wire-active wire-out" d="M 260 52 L 260 26 L 126 26 L 126 4" vector-effect="non-scaling-stroke" />
                <path class="bus-wire-active wire-out" d="M 260 52 L 260 26 L 394 26 L 394 4" vector-effect="non-scaling-stroke" />
                <polygon class="bus-arrow" points="126,0 122,6 130,6" />
                <polygon class="bus-arrow" points="394,0 390,6 398,6" />
                <g class="packet-pill-in packet-input">
                  <rect x="-32" y="-9" width="64" height="17" rx="2" />
                  <text x="0" y="3">root.input</text>
                </g>
                <g class="packet-pill-view packet-v-tl">
                  <rect x="-29" y="-9" width="58" height="17" rx="2" />
                  <text x="0" y="3">root.view</text>
                </g>
                <g class="packet-pill-view packet-v-tr">
                  <rect x="-29" y="-9" width="58" height="17" rx="2" />
                  <text x="0" y="3">root.view</text>
                </g>
              </svg>

              <div class="engine-hub">
                <div class="engine-hub-title">
                  <span class="engine-stamp" aria-hidden="true">&check;</span>
                  <span>Blast Engine</span>
                </div>
                <div class="engine-hub-sub">root.input &rarr; reconcile &rarr; root.view</div>
              </div>

              <svg class="bus-svg bus-bottom" viewBox="0 0 520 52" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <path class="bus-track" d="M 260 0 L 260 26 L 126 26 L 126 48" vector-effect="non-scaling-stroke" />
                <path class="bus-track" d="M 260 0 L 260 26 L 394 26 L 394 48" vector-effect="non-scaling-stroke" />
                <path class="bus-wire-active wire-out" d="M 260 0 L 260 26 L 126 26 L 126 48" vector-effect="non-scaling-stroke" />
                <path class="bus-wire-active wire-out" d="M 260 0 L 260 26 L 394 26 L 394 48" vector-effect="non-scaling-stroke" />
                <polygon class="bus-arrow" points="126,52 122,46 130,46" />
                <polygon class="bus-arrow" points="394,52 390,46 398,46" />
                <g class="packet-pill-view packet-v-bl">
                  <rect x="-29" y="-9" width="58" height="17" rx="2" />
                  <text x="0" y="3">root.view</text>
                </g>
                <g class="packet-pill-view packet-v-br">
                  <rect x="-29" y="-9" width="58" height="17" rx="2" />
                  <text x="0" y="3">root.view</text>
                </g>
              </svg>

              <div class="host-shell host-web">
                <div class="host-head">
                  <span class="host-name">Web page</span>
                  <span class="host-kind">DOM</span>
                </div>
                <div class="host-sub"><code>@blastlauncher/web</code> <code>mount()</code></div>
                <div class="idiom-web" aria-hidden="true">
                  <div class="web-dom-tag">&lt;ul role=&quot;listbox&quot;&gt;</div>
                  <ul class="web-list">
                    <li class="web-row row-apple">Apple</li>
                    <li class="web-row row-collapse">Banana</li>
                    <li class="web-row row-collapse">Cherry</li>
                  </ul>
                </div>
              </div>

              <div class="host-shell host-stdio">
                <div class="host-head">
                  <span class="host-name">Go / Python</span>
                  <span class="host-kind">Stdio</span>
                </div>
                <div class="host-sub"><code>blast serve</code>, NDJSON</div>
                <div class="idiom-ndjson" aria-hidden="true">
                  <div class="ndjson-prompt">$ blast serve &larr; stdout</div>
                  <code class="ndjson-line ndjson-line-1">{&quot;event&quot;:&quot;root.view&quot;,&quot;view&quot;:</code>
                  <code class="ndjson-line ndjson-line-2">{&quot;kind&quot;:&quot;list&quot;,&quot;rows&quot;:[…]}}</code>
                </div>
              </div>
            </div>
          </figure>
        </div>
      </div>
    </section>

    <!-- 1. The whole integration -->
    <section class="manual-section" id="integration">
      <div class="container manual-grid">
        <div class="manual-main">
          <h2 class="section-title"><span class="section-num">1.</span>The whole integration</h2>
          <p class="section-desc">Open extensions, draw the engine's views, and forward input in a few lines of your language of choice, or one <code>mount()</code> call in a web page.</p>

          <div class="tab-group">
            <!-- Radio inputs for CSS-only tab switching -->
            <input type="radio" id="tab-js" name="tab-lang" class="tab-radio" checked aria-controls="panel-js">
            <input type="radio" id="tab-web" name="tab-lang" class="tab-radio" aria-controls="panel-web">
            <input type="radio" id="tab-go" name="tab-lang" class="tab-radio" aria-controls="panel-go">
            <input type="radio" id="tab-py" name="tab-lang" class="tab-radio" aria-controls="panel-py">
            <input type="radio" id="tab-swift" name="tab-lang" class="tab-radio" aria-controls="panel-swift">
            <input type="radio" id="tab-ndjson" name="tab-lang" class="tab-radio" aria-controls="panel-ndjson">

            <div class="tab-nav" role="tablist" aria-label="Integration code examples">
              <label for="tab-js" id="label-js" role="tab">JavaScript</label>
              <label for="tab-web" id="label-web" role="tab">Web page</label>
              <label for="tab-go" id="label-go" role="tab">Go</label>
              <label for="tab-py" id="label-py" role="tab">Python</label>
              <label for="tab-swift" id="label-swift" role="tab">Swift</label>
              <label for="tab-ndjson" id="label-ndjson" role="tab">NDJSON</label>
            </div>

            <div class="tab-panels">
              <div class="tab-panel panel-js" id="panel-js" role="tabpanel" aria-labelledby="label-js">
                <pre><code>${jsSnippet}</code></pre>
                <p class="tab-caption">The in-process engine: Node.js, Bun or Electron</p>
              </div>

              <div class="tab-panel panel-web" id="panel-web" role="tabpanel" aria-labelledby="label-web">
                <pre><code>${webSnippet}</code></pre>
                <p class="tab-caption">@blastlauncher/web: the extension runs in a sandbox on a second origin you host</p>
              </div>

              <div class="tab-panel panel-go" id="panel-go" role="tabpanel" aria-labelledby="label-go">
                <pre><code>${goSnippet}</code></pre>
                <p class="tab-caption">Client from examples/go-embedder</p>
              </div>

              <div class="tab-panel panel-py" id="panel-py" role="tabpanel" aria-labelledby="label-py">
                <pre><code>${pySnippet}</code></pre>
                <p class="tab-caption">Standard library only, from examples/python-embedder</p>
              </div>

              <div class="tab-panel panel-swift" id="panel-swift" role="tabpanel" aria-labelledby="label-swift">
                <pre><code>${swiftSnippet}</code></pre>
                <p class="tab-caption">BlastKit from examples/macos-launcher</p>
              </div>

              <div class="tab-panel panel-ndjson" id="panel-ndjson" role="tabpanel" aria-labelledby="label-ndjson">
                <pre><code>${ndjsonSnippet}</code></pre>
                <p class="tab-caption">Lines starting with → are what you send, ← what you receive.</p>
              </div>
            </div>
          </div>
        </div>
        <aside class="marginalia">
          Read the <a href="${quickstartUrl}">quickstart</a> or browse the <a href="${docsUrl}">full docs</a> for transport and protocol details.
        </aside>
      </div>
    </section>

    <!-- 2. What Blast does / what you do -->
    <section class="manual-section responsibilities">
      <div class="container manual-grid">
        <div class="manual-main">
          <h2 class="section-title"><span class="section-num">2.</span>What Blast does / what you do</h2>
          <table class="ruled-table boundary-table">
            <thead>
              <tr>
                <th>What Blast does</th>
                <th>What you do</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="Blast"><strong>Launcher flow.</strong> Lists every extension's commands as a root view, asks for missing preferences and arguments, and installs dependencies.</td>
                <td data-label="You"><strong>Render views.</strong> Draw the view nodes (List, Detail, Form, Grid) in your app's native UI toolkit.</td>
              </tr>
              <tr>
                <td data-label="Blast"><strong>Bundling &amp; runtime.</strong> Bundles each extension with esbuild and runs each command in its own Node.js process.</td>
                <td data-label="You"><strong>Forward input.</strong> Send search keystrokes, item selections, and button clicks back to the session.</td>
              </tr>
              <tr>
                <td data-label="Blast"><strong>Raycast compatibility.</strong> Provides <code>@raycast/api</code> (and ships <code>@raycast/utils</code>), with coverage measured against the latest release.</td>
                <td data-label="You"><strong>Answer capabilities.</strong> Choose which capabilities to grant (clipboard, storage, OAuth) per your security policy.</td>
              </tr>
              <tr>
                <td data-label="Blast"><strong>UI reconciliation.</strong> Reconciles React trees into serializable views with search, selection and actions applied.</td>
                <td data-label="You"><strong>Pick your transport.</strong> Embed in-process via TypeScript, across processes via standard I/O, or in a web page with <code>@blastlauncher/web</code>.</td>
              </tr>
              <tr>
                <td data-label="Blast"><strong>Capability brokering.</strong> Mediates storage, clipboard, OAuth and AI access, through explicit grants.</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <aside class="marginalia">
          The engine reconciles views; your host owns pixels and capability policy.
        </aside>
      </div>
    </section>

    <!-- 3. Runs everywhere -->
    <section class="manual-section platforms">
      <div class="container manual-grid">
        <div class="manual-main">
          <h2 class="section-title"><span class="section-num">3.</span>Runs everywhere</h2>
          <table class="ruled-table runs-table">
            <thead>
              <tr>
                <th>Host</th>
                <th>Transport</th>
                <th>Details</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="col-host">Node / Bun / Electron</td>
                <td class="col-transport">In-process</td>
                <td>Engine integration for JavaScript and TypeScript hosts with no separate process for the engine.</td>
                <td class="col-link"><a href="https://github.com/blastlauncher/blast/tree/main/packages/host">packages/host</a></td>
              </tr>
              <tr>
                <td class="col-host">Any language via serve</td>
                <td class="col-transport">Stdio NDJSON</td>
                <td>Simple NDJSON protocol over standard I/O for Go, Python, Swift, or Rust.</td>
                <td class="col-link"><a href="https://github.com/blastlauncher/blast/tree/main/packages/serve">packages/serve</a></td>
              </tr>
              <tr>
                <td class="col-host">Any web page</td>
                <td class="col-transport">Browser</td>
                <td>One <code>mount()</code> runs extensions by URL in a cross-origin sandboxed iframe (almostnode), with nothing installed.</td>
                <td class="col-link"><a href="https://github.com/blastlauncher/blast/tree/main/packages/web">packages/web</a></td>
              </tr>
              <tr>
                <td class="col-host">Terminal and tmux</td>
                <td class="col-transport">Terminal</td>
                <td>A keyboard-driven terminal client for lists, grids, forms and markdown details. In tmux it opens as a command palette in a popup, with pane, window and session commands.</td>
                <td class="col-link"><a href="https://github.com/BlastLauncher/tmux-blast">tmux-blast</a></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- 4. Receipts -->
    <section class="manual-section receipts">
      <div class="container manual-grid">
        <div class="manual-main">
          <h2 class="section-title"><span class="section-num">4.</span>Receipts</h2>
          <div class="ledger-row">
            <div class="ledger-cell">
              <div class="ledger-num">${stats.coverage.percent}</div>
              <div class="ledger-label">Raycast API covered (${stats.coverage.covered} of ${stats.coverage.total})</div>
            </div>
            <div class="ledger-cell">
              <div class="ledger-num">${stats.rendered.toLocaleString()}</div>
              <div class="ledger-label">Catalog commands rendered</div>
            </div>
            <div class="ledger-cell">
              <div class="ledger-num">${stats.commands.toLocaleString()}</div>
              <div class="ledger-label">Total catalog commands tested</div>
            </div>
          </div>
          <p class="ledger-note">Measured compatibility against real extensions from the public catalog: <a href="${coverageUrl}" target="_blank" rel="noopener">API Coverage Report</a> and <a href="${sweepUrl}" target="_blank" rel="noopener">Full Sweep Results</a>.</p>
        </div>
      </div>
    </section>

    <!-- 5. Install -->
    <section class="manual-section install">
      <div class="container manual-grid">
        <div class="manual-main">
          <h2 class="section-title"><span class="section-num">5.</span>Install</h2>
          <p class="section-desc">Prereleases (<code>3.0.0-alpha.3</code>) are on npm under <code>next</code>; install with <code>@next</code>, not <code>latest</code>. The <a href="${quickstartUrl}">quickstart</a> runs each one against a real extension.</p>

          <dl class="install-list">
            <div class="install-item">
              <dt>JS/TS Engine</dt>
              <dd><code class="install-code">npm install @blastlauncher/engine@next</code></dd>
            </div>
            <div class="install-item">
              <dt>Any Language (stdio)</dt>
              <dd><code class="install-code">npx -p @blastlauncher/serve@next blast-serve</code></dd>
            </div>
            <div class="install-item">
              <dt>Web Page</dt>
              <dd><code class="install-code">npm install @blastlauncher/web@next</code></dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="container footer-inner">
      <p class="footer-colophon">Blast is open source (MIT) and in alpha.</p>
      <nav class="nav-links" aria-label="Footer Navigation">
        <a href="${demoUrl}">Demo</a>
        <a href="${docsUrl}">Docs</a>
        <a href="${quickstartUrl}">Quickstart</a>
        <a href="${coverageUrl}">Coverage</a>
        <a href="${sweepUrl}">Sweep</a>
        <a href="${repoUrl}">GitHub</a>
      </nav>
    </div>
  </footer>
</body>
</html>`;
}
