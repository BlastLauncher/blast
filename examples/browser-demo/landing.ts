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
      padding-left: 1.35rem;
    }
    /* Mobile vertical bus trunk connecting engine at top to 4 stacked hosts */
    .mobile-rail {
      position: absolute;
      left: 0.45rem;
      top: 2.75rem;
      bottom: 5.5rem;
      width: 1px;
      background: repeating-linear-gradient(
        to bottom,
        var(--accent) 0 4px,
        transparent 4px 8px
      );
      pointer-events: none;
    }
    .mobile-rail-packet {
      position: absolute;
      left: -4px;
      top: 0%;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      transform: translateY(-50%);
      background: var(--accent);
      animation: rail-travel 3.2s linear infinite;
      pointer-events: none;
    }
    .engine-hub {
      order: 0;
      position: relative;
      background: var(--code-bg);
      color: var(--code-text);
      border: 1px solid var(--code-border);
      outline: 1px solid var(--accent);
      outline-offset: -4px;
      border-radius: var(--radius);
      padding: 0.7rem 1rem;
      text-align: center;
    }
    .engine-hub::before {
      content: "";
      position: absolute;
      left: -0.95rem;
      top: 50%;
      width: 0.95rem;
      height: 1px;
      background: var(--accent);
    }
    .engine-hub-title {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-family: var(--font-serif);
      font-weight: 700;
      font-size: 0.95rem;
      letter-spacing: 0.01em;
    }
    .engine-pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      display: inline-block;
      animation: engine-beat 2s ease-in-out infinite;
    }
    .engine-hub-sub {
      margin-top: 0.15rem;
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      color: var(--code-muted);
    }

    .bus-svg {
      display: none;
    }

    .host-shell {
      position: relative;
      background: var(--bg);
      border: 1px solid var(--rule-strong);
      border-radius: var(--radius);
      padding: 0.55rem 0.65rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .host-shell::before {
      content: "";
      position: absolute;
      left: -0.9rem;
      top: 50%;
      width: 0.9rem;
      height: 1px;
      background: var(--rule-strong);
    }
    .host-macos { order: 1; }
    .host-tmux { order: 2; }
    .host-web { order: 3; }
    .host-stdio { order: 4; }

    .host-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.4rem;
      border-bottom: 1px solid var(--rule);
      padding-bottom: 0.3rem;
    }
    .host-name {
      font-family: var(--font-serif);
      font-weight: 700;
      font-size: 0.875rem;
      color: var(--ink);
    }
    .host-kind {
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      color: var(--accent);
      white-space: nowrap;
    }
    .host-sub {
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      color: var(--ink-muted);
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .host-sub code {
      font-size: 0.6875rem;
      padding: 0 0.2em;
    }

    .mini-cmd {
      border: 1px solid var(--rule);
      background: var(--paper);
      border-radius: 2px;
      padding: 0.35rem;
    }
    .mini-search {
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      color: var(--ink-muted);
      border-bottom: 1px solid var(--rule);
      padding-bottom: 0.2rem;
      margin-bottom: 0.25rem;
    }
    .mini-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .mini-row {
      font-size: 0.72rem;
      line-height: 1.3;
      padding: 0.14rem 0.35rem;
      border-radius: 2px;
      color: var(--ink-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .mini-row.active {
      background: var(--accent);
      color: var(--accent-ink);
      font-weight: 600;
      animation: row-receive 2.8s ease-in-out infinite;
    }
    .host-tmux .mini-row.active { animation-delay: 0.35s; }
    .host-web .mini-row.active { animation-delay: 0.7s; }
    .host-stdio .mini-row.active { animation-delay: 1.05s; }

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
        height: 48px;
        overflow: visible;
      }
      .engine-hub {
        order: 4;
        grid-column: 1 / -1;
        justify-self: center;
        min-width: 230px;
      }
      .bus-bottom {
        display: block;
        order: 5;
        grid-column: 1 / -1;
        width: 100%;
        height: 48px;
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
    .bus-flow {
      fill: none;
      stroke: var(--accent);
      stroke-width: 1.5;
      stroke-dasharray: 4 6;
      animation: bus-dash 1.2s linear infinite;
    }
    .bus-arrow {
      fill: var(--accent);
    }
    .bus-tag-bg {
      fill: var(--paper);
      stroke: var(--rule-strong);
      stroke-width: 1;
    }
    .bus-tag-text {
      fill: var(--ink-muted);
      font-family: var(--font-mono);
      font-size: 9.5px;
      text-anchor: middle;
    }
    .bus-packet {
      fill: var(--accent);
      stroke: var(--paper);
      stroke-width: 1.5;
    }
    .packet-tl {
      animation: send-tl 2.6s ease-in-out infinite;
    }
    .packet-tr {
      animation: send-tr 2.6s ease-in-out infinite -0.65s;
    }
    .packet-bl {
      animation: send-bl 2.6s ease-in-out infinite -1.3s;
    }
    .packet-br {
      animation: send-br 2.6s ease-in-out infinite -1.95s;
    }

    @keyframes bus-dash {
      from { stroke-dashoffset: 20; }
      to { stroke-dashoffset: 0; }
    }
    @keyframes engine-beat {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.45; transform: scale(0.82); }
    }
    @keyframes row-receive {
      0%, 60%, 100% { filter: brightness(1); }
      30% { filter: brightness(1.12); }
    }
    @keyframes rail-travel {
      0% { top: 0%; opacity: 0; }
      8% { opacity: 1; }
      92% { opacity: 1; }
      100% { top: 100%; opacity: 0; }
    }
    @keyframes send-tl {
      0% { transform: translate(260px, 46px); opacity: 0; }
      10% { opacity: 1; }
      45% { transform: translate(260px, 24px); opacity: 1; }
      78% { transform: translate(126px, 24px); opacity: 1; }
      94% { transform: translate(126px, 6px); opacity: 1; }
      100% { transform: translate(126px, 3px); opacity: 0; }
    }
    @keyframes send-tr {
      0% { transform: translate(260px, 46px); opacity: 0; }
      10% { opacity: 1; }
      45% { transform: translate(260px, 24px); opacity: 1; }
      78% { transform: translate(394px, 24px); opacity: 1; }
      94% { transform: translate(394px, 6px); opacity: 1; }
      100% { transform: translate(394px, 3px); opacity: 0; }
    }
    @keyframes send-bl {
      0% { transform: translate(260px, 2px); opacity: 0; }
      10% { opacity: 1; }
      45% { transform: translate(260px, 24px); opacity: 1; }
      78% { transform: translate(126px, 24px); opacity: 1; }
      94% { transform: translate(126px, 42px); opacity: 1; }
      100% { transform: translate(126px, 45px); opacity: 0; }
    }
    @keyframes send-br {
      0% { transform: translate(260px, 2px); opacity: 0; }
      10% { opacity: 1; }
      45% { transform: translate(260px, 24px); opacity: 1; }
      78% { transform: translate(394px, 24px); opacity: 1; }
      94% { transform: translate(394px, 42px); opacity: 1; }
      100% { transform: translate(394px, 45px); opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .bus-flow,
      .bus-packet,
      .engine-pulse,
      .mini-row.active,
      .mobile-rail-packet {
        animation: none;
      }
      .bus-packet,
      .mobile-rail-packet {
        display: none;
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
          <figure class="plate" aria-label="Diagram showing Blast's engine in the centre sending animated view messages out to four host shells — macOS app, Terminal / tmux, Web page, and Go / Python — each drawing the same small command list.">
            <figcaption class="plate-header">
              <span class="plate-num">Plate I &middot; Architecture</span>
              <span class="plate-title">Engine &rarr; Host Shells</span>
            </figcaption>
            <div class="diagram-canvas">
              <div class="mobile-rail" aria-hidden="true"><span class="mobile-rail-packet"></span></div>

              <div class="host-shell host-macos">
                <div class="host-head">
                  <span class="host-name">macOS app</span>
                  <span class="host-kind">Swift</span>
                </div>
                <div class="host-sub"><code>examples/macos-launcher</code>, BlastKit</div>
                <div class="mini-cmd" aria-hidden="true">
                  <div class="mini-search">Search&hellip;</div>
                  <ul class="mini-list">
                    <li class="mini-row active"><span>Apple</span><span>&crarr;</span></li>
                    <li class="mini-row"><span>Banana</span></li>
                    <li class="mini-row"><span>Cherry</span></li>
                  </ul>
                </div>
              </div>

              <div class="host-shell host-tmux">
                <div class="host-head">
                  <span class="host-name">Terminal / tmux</span>
                  <span class="host-kind">TUI</span>
                </div>
                <div class="host-sub"><code>blast-tui</code></div>
                <div class="mini-cmd" aria-hidden="true">
                  <div class="mini-search">Search&hellip;</div>
                  <ul class="mini-list">
                    <li class="mini-row active"><span>Apple</span><span>&crarr;</span></li>
                    <li class="mini-row"><span>Banana</span></li>
                    <li class="mini-row"><span>Cherry</span></li>
                  </ul>
                </div>
              </div>

              <svg class="bus-svg bus-top" viewBox="0 0 520 48" preserveAspectRatio="none" aria-hidden="true">
                <path class="bus-track" d="M 260 48 L 260 24 L 126 24 L 126 5" vector-effect="non-scaling-stroke" />
                <path class="bus-track" d="M 260 48 L 260 24 L 394 24 L 394 5" vector-effect="non-scaling-stroke" />
                <path class="bus-flow" d="M 260 48 L 260 24 L 126 24 L 126 5" vector-effect="non-scaling-stroke" />
                <path class="bus-flow" d="M 260 48 L 260 24 L 394 24 L 394 5" vector-effect="non-scaling-stroke" />
                <polygon class="bus-arrow" points="126,0 121,7 131,7" />
                <polygon class="bus-arrow" points="394,0 389,7 399,7" />
                <rect class="bus-tag-bg" x="228" y="15" width="64" height="17" rx="2" />
                <text class="bus-tag-text" x="260" y="27">root.view</text>
                <circle class="bus-packet packet-tl" cx="0" cy="0" r="4" />
                <circle class="bus-packet packet-tr" cx="0" cy="0" r="4" />
              </svg>

              <div class="engine-hub">
                <div class="engine-hub-title">
                  <span class="engine-pulse" aria-hidden="true"></span>
                  <span>Blast Engine</span>
                </div>
                <div class="engine-hub-sub">root.view &middot; session.view &middot; capability.request</div>
              </div>

              <svg class="bus-svg bus-bottom" viewBox="0 0 520 48" preserveAspectRatio="none" aria-hidden="true">
                <path class="bus-track" d="M 260 0 L 260 24 L 126 24 L 126 43" vector-effect="non-scaling-stroke" />
                <path class="bus-track" d="M 260 0 L 260 24 L 394 24 L 394 43" vector-effect="non-scaling-stroke" />
                <path class="bus-flow" d="M 260 0 L 260 24 L 126 24 L 126 43" vector-effect="non-scaling-stroke" />
                <path class="bus-flow" d="M 260 0 L 260 24 L 394 24 L 394 43" vector-effect="non-scaling-stroke" />
                <polygon class="bus-arrow" points="126,48 121,41 131,41" />
                <polygon class="bus-arrow" points="394,48 389,41 399,41" />
                <rect class="bus-tag-bg" x="220" y="15" width="80" height="17" rx="2" />
                <text class="bus-tag-text" x="260" y="27">session.view</text>
                <circle class="bus-packet packet-bl" cx="0" cy="0" r="4" />
                <circle class="bus-packet packet-br" cx="0" cy="0" r="4" />
              </svg>

              <div class="host-shell host-web">
                <div class="host-head">
                  <span class="host-name">Web page</span>
                  <span class="host-kind">DOM</span>
                </div>
                <div class="host-sub"><code>@blastlauncher/web</code> <code>mount()</code></div>
                <div class="mini-cmd" aria-hidden="true">
                  <div class="mini-search">Search&hellip;</div>
                  <ul class="mini-list">
                    <li class="mini-row active"><span>Apple</span><span>&crarr;</span></li>
                    <li class="mini-row"><span>Banana</span></li>
                    <li class="mini-row"><span>Cherry</span></li>
                  </ul>
                </div>
              </div>

              <div class="host-shell host-stdio">
                <div class="host-head">
                  <span class="host-name">Go / Python</span>
                  <span class="host-kind">Stdio</span>
                </div>
                <div class="host-sub"><code>blast serve</code>, NDJSON</div>
                <div class="mini-cmd" aria-hidden="true">
                  <div class="mini-search">Search&hellip;</div>
                  <ul class="mini-list">
                    <li class="mini-row active"><span>Apple</span><span>&crarr;</span></li>
                    <li class="mini-row"><span>Banana</span></li>
                    <li class="mini-row"><span>Cherry</span></li>
                  </ul>
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
