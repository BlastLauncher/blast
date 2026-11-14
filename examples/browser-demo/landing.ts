// Landing page for Blast: simple API, any language, demo front and centre.
// Pure HTML/CSS, zero dependencies, accessible, responsive at 360px, honours dark mode.

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
  const quickstartUrl = "https://github.com/blastlauncher/blast/blob/main/docs/quickstart.md";
  const coverageUrl = "https://github.com/blastlauncher/blast/blob/main/compat/COVERAGE.md";
  const sweepUrl = "https://github.com/blastlauncher/blast/blob/main/SWEEP.md";
  const repoUrl = "https://github.com/blastlauncher/blast";

  const jsSnippet = escapeHtml(String.raw`import { createEngine } from "@blastlauncher/engine";
import { createController } from "@blastlauncher/client-core";

const engine = createEngine({ handlers: { "clipboard.copy": (p) => copy(p) } });
const extension = engine.openExtension({ extensionDir: "./my-extension" });
const { session, close } = await extension.launch("index");
const controller = createController({ platform: "macOS" });
const apply = ({ events }) =>
  events.forEach((e) => session.sendEvent(e.node, e.handler, e.args));
session.scenes((scene) => apply(controller.scene(scene)));
controller.subscribe((view) => draw(view));
onSearch((text) => apply(controller.input({ type: "search", text })));`);

  const goSnippet =
    escapeHtml(String.raw`client, _ := Start("packages/serve/src/main.ts", os.Stdout) // spawns blast serve
defer client.Close()
extension, _ := client.Open("./my-extension")
client.Launch(extension, "index") // views on, platform macOS
view, _ := client.WaitView(-1, 5*time.Second)
draw(view) // search, rows, actions, toast
client.Input(controllerInput{Type: "search", Text: "ap"})`);

  const pySnippet = escapeHtml(String.raw`import json, subprocess
blast = subprocess.Popen(["npx", "-p", "@blastlauncher/serve@next", "blast-serve"],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
def send(message):
    blast.stdin.write(json.dumps(message) + "\n"); blast.stdin.flush()
def request(id, method, **params):
    send({"type": "request", "id": id, "method": method, "params": params})

send({"type": "hello", "protocol": 1, "capabilities": ["clipboard.copy"]})
request("1", "extension.open", dir="./my-extension")
for message in map(json.loads, blast.stdout):
    if message["type"] == "response" and message["id"] == "1":
        request("2", "extension.launch", extension=message["result"]["extension"],
                command="index", views={"platform": "macOS"})
    elif message.get("event") == "session.view":
        draw(message["view"])
    elif message["type"] == "capability.request":
        send({"type": "capability.result", "id": message["id"], "ok": True, "value": None})`);

  const swiftSnippet = escapeHtml(String.raw`let blast = BlastClient(transport: ProcessTransport(
    servePath: ProcessTransport.defaultServePath, workingDirectory: root))
blast.onEvent = { event in
    if case let .view(_, view) = event { draw(view) }
}
_ = try await blast.start(capabilities: ["clipboard.copy"])
let ext = try await blast.openExtension(dir: "./my-extension")
let session = try await blast.launchExtension(extension: ext, command: "index")
try await blast.sendInput(.search("ap"), session: session)`);

  const ndjsonSnippet =
    escapeHtml(String.raw`→ {"type":"hello","protocol":1,"capabilities":["clipboard.copy"]}
← {"type":"welcome","protocol":1,"engine":{…},"catalog":{…}}
→ {"type":"request","id":"1","method":"extension.open","params":{"dir":"./my-extension"}}
← {"type":"response","id":"1","ok":true,"result":{"extension":"1"}}
→ {"type":"request","id":"2","method":"extension.launch","params":{"extension":"1","command":"index","views":{"platform":"macOS"}}}
← {"type":"event","event":"session.view","session":"2","view":{"kind":"list","rows":[…]}}
→ {"type":"request","id":"3","method":"session.input","params":{"session":"2","input":{"type":"search","text":"ap"}}}
← {"type":"capability.request","id":"c1","session":"2","name":"clipboard.copy","params":{…}}
→ {"type":"capability.result","id":"c1","ok":true,"value":null}`);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Blast — Raycast extensions, inside your app</title>
  <meta name="description" content="Embed unmodified Raycast extensions inside your application in any language.">
  <style>
    :root {
      --bg: #ffffff;
      --bg-alt: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --text-muted: #475569;
      --border: #e2e8f0;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --accent-light: #eff6ff;
      --code-bg: #0f172a;
      --code-text: #f8fafc;
      --code-border: #1e293b;
      --tag-bg: #e0f2fe;
      --tag-text: #0369a1;
      --focus-ring: #3b82f6;
      --radius: 8px;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0b0f17;
        --bg-alt: #111827;
        --card-bg: #151d2c;
        --text: #f1f5f9;
        --text-muted: #94a3b8;
        --border: #1e293b;
        --accent: #3b82f6;
        --accent-hover: #60a5fa;
        --accent-light: #1e293b;
        --code-bg: #030712;
        --code-text: #f9fafb;
        --code-border: #1f2937;
        --tag-bg: #1e293b;
        --tag-text: #38bdf8;
        --focus-ring: #60a5fa;
      }
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      font-family: var(--font-sans);
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
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
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }

    code, pre {
      font-family: var(--font-mono);
      font-size: 0.875rem;
    }
    pre {
      max-width: 100%;
      overflow-x: auto;
    }

    .container {
      width: 100%;
      max-width: 1120px;
      margin: 0 auto;
      padding: 0 1.25rem;
      box-sizing: border-box;
    }

    /* Main & Section containment */
    main {
      flex: 1 1 auto;
      min-width: 0;
      max-width: 100%;
      overflow-x: hidden;
    }

    /* Grid and flex item containment */
    .hero-grid > *,
    .wire-mock-split > *,
    .compare-grid > *,
    .cards-grid > *,
    .stats-row > *,
    .install-boxes > *,
    .tab-group,
    .tab-panels,
    .wire-mock-card {
      min-width: 0;
      max-width: 100%;
    }

    /* Header */
    header {
      border-bottom: 1px solid var(--border);
      padding: 1rem 0;
      background: var(--bg);
    }
    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 700;
      font-size: 1.125rem;
      color: var(--text);
      text-decoration: none;
    }
    .brand:hover {
      text-decoration: none;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-size: 0.9375rem;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.625rem 1.25rem;
      border-radius: var(--radius);
      font-weight: 600;
      font-size: 0.9375rem;
      cursor: pointer;
      text-decoration: none;
      transition: background-color 0.15s ease, border-color 0.15s ease;
      white-space: nowrap;
    }
    .btn-primary {
      background-color: var(--accent);
      color: #ffffff;
      border: 1px solid var(--accent);
    }
    .btn-primary:hover {
      background-color: var(--accent-hover);
      text-decoration: none;
    }
    .btn-secondary {
      background-color: transparent;
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background-color: var(--bg-alt);
      text-decoration: none;
    }

    /* Hero */
    .hero {
      padding: 3.5rem 0 3rem;
      border-bottom: 1px solid var(--border);
    }
    .hero-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 2.5rem;
      align-items: center;
    }
    @media (min-width: 840px) {
      .hero-grid {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
    .hero-content h1 {
      font-size: clamp(1.75rem, 5vw, 2.75rem);
      line-height: 1.15;
      font-weight: 800;
      letter-spacing: -0.025em;
      margin-bottom: 1rem;
      word-break: break-word;
    }
    .hero-content p {
      font-size: 1.125rem;
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: 1.75rem;
    }
    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    /* Wire & Mock Display */
    .wire-mock-card {
      background: var(--code-bg);
      color: var(--code-text);
      border: 1px solid var(--code-border);
      border-radius: var(--radius);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    }
    .wire-mock-header {
      background: rgba(255, 255, 255, 0.05);
      border-bottom: 1px solid var(--code-border);
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
      font-family: var(--font-mono);
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .wire-mock-split {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }
    @media (min-width: 580px) {
      .wire-mock-split {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
    .mock-view {
      padding: 1rem;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid var(--code-border);
    }
    @media (min-width: 580px) {
      .mock-view {
        border-bottom: none;
        border-right: 1px solid var(--code-border);
      }
    }
    .mock-search-bar {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 4px;
      padding: 0.375rem 0.5rem;
      font-size: 0.8125rem;
      color: var(--code-text);
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }
    .mock-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .mock-item {
      padding: 0.375rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .mock-item.active {
      background: var(--accent);
      color: #ffffff;
    }
    .mock-item:not(.active) {
      background: rgba(255, 255, 255, 0.04);
      color: #94a3b8;
    }
    .mock-item-sub {
      font-size: 0.6875rem;
      opacity: 0.75;
    }
    .mock-wire {
      padding: 1rem;
      overflow-x: auto;
      font-size: 0.75rem;
      line-height: 1.6;
      min-width: 0;
      max-width: 100%;
    }
    .mock-wire pre {
      white-space: pre;
      color: #cbd5e1;
      min-width: 0;
      max-width: 100%;
    }
    .wire-in { color: #38bdf8; }
    .wire-out { color: #a7f3d0; }

    /* Section base */
    section {
      padding: 3.5rem 0;
      border-bottom: 1px solid var(--border);
      min-width: 0;
      max-width: 100%;
      overflow-x: hidden;
    }
    .section-title {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 0.5rem;
    }
    .section-desc {
      font-size: 1rem;
      color: var(--text-muted);
      margin-bottom: 2rem;
      max-width: 680px;
    }

    /* Tabs (Pure CSS) */
    .tab-group {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--card-bg);
      overflow: hidden;
      min-width: 0;
      max-width: 100%;
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
      background: var(--bg-alt);
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
      scrollbar-width: thin;
      min-width: 0;
      max-width: 100%;
    }
    .tab-nav label {
      display: inline-block;
      padding: 0.75rem 1.25rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab-nav label:hover {
      color: var(--text);
    }

    /* Radio checked selectors */
    #tab-js:checked ~ .tab-nav label[for="tab-js"],
    #tab-go:checked ~ .tab-nav label[for="tab-go"],
    #tab-py:checked ~ .tab-nav label[for="tab-py"],
    #tab-swift:checked ~ .tab-nav label[for="tab-swift"],
    #tab-ndjson:checked ~ .tab-nav label[for="tab-ndjson"] {
      color: var(--accent);
      border-bottom-color: var(--accent);
      background: var(--card-bg);
    }

    #tab-js:focus-visible ~ .tab-nav label[for="tab-js"],
    #tab-go:focus-visible ~ .tab-nav label[for="tab-go"],
    #tab-py:focus-visible ~ .tab-nav label[for="tab-py"],
    #tab-swift:focus-visible ~ .tab-nav label[for="tab-swift"],
    #tab-ndjson:focus-visible ~ .tab-nav label[for="tab-ndjson"] {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }

    .tab-panels .tab-panel {
      display: none;
      padding: 1.25rem;
      background: var(--code-bg);
      color: var(--code-text);
      overflow-x: auto;
    }
    .tab-panels pre {
      line-height: 1.55;
      font-size: 0.84rem;
    }
    .tab-panels .tab-caption {
      margin-top: 0.875rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--code-border);
      font-size: 0.8125rem;
      color: #94a3b8;
    }

    #tab-js:checked ~ .tab-panels .panel-js,
    #tab-go:checked ~ .tab-panels .panel-go,
    #tab-py:checked ~ .tab-panels .panel-py,
    #tab-swift:checked ~ .tab-panels .panel-swift,
    #tab-ndjson:checked ~ .tab-panels .panel-ndjson {
      display: block;
    }

    /* Two-column comparison */
    .compare-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 1.5rem;
    }
    @media (min-width: 680px) {
      .compare-grid {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
    .compare-col {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
    }
    .compare-col h3 {
      font-size: 1.125rem;
      font-weight: 700;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .compare-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .compare-list li {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      font-size: 0.9375rem;
      color: var(--text-muted);
      line-height: 1.45;
    }
    .compare-list li strong {
      color: var(--text);
    }
    .bullet-blast { color: #10b981; font-weight: bold; }
    .bullet-you { color: var(--accent); font-weight: bold; }

    /* Cards Grid */
    .cards-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 1.25rem;
    }
    @media (min-width: 600px) {
      .cards-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (min-width: 960px) {
      .cards-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      text-decoration: none;
    }
    .card h3 {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 0.5rem;
    }
    .card p {
      font-size: 0.875rem;
      color: var(--text-muted);
      line-height: 1.5;
      margin-bottom: 1rem;
      flex-grow: 1;
    }
    .card .card-link {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--accent);
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }

    /* Receipts / Stats */
    .stats-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }
    @media (min-width: 600px) {
      .stats-row {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      text-align: center;
    }
    .stat-value {
      font-size: 2rem;
      font-weight: 800;
      color: var(--text);
      line-height: 1.1;
      margin-bottom: 0.25rem;
    }
    .stat-label {
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    .receipts-links {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      font-size: 0.9375rem;
    }

    /* Install */
    .install-boxes {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 1rem;
    }
    @media (min-width: 700px) {
      .install-boxes {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
    .install-box {
      background: var(--code-bg);
      border: 1px solid var(--code-border);
      border-radius: var(--radius);
      padding: 1rem 1.25rem;
    }
    .install-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }
    .install-code {
      color: var(--code-text);
      font-family: var(--font-mono);
      font-size: 0.875rem;
      user-select: all;
      word-break: break-all;
    }

    /* Footer */
    footer {
      padding: 2.5rem 0;
      background: var(--bg);
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-top: auto;
    }
    .footer-inner {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      align-items: center;
      justify-content: space-between;
      text-align: center;
    }
    @media (min-width: 600px) {
      .footer-inner {
        flex-direction: row;
        text-align: left;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="container header-inner">
      <a href="${origin}/" class="brand">
        <span>Blast</span>
      </a>
      <nav class="nav-links" aria-label="Main Navigation">
        <a href="${demoUrl}">Live Demo</a>
        <a href="${quickstartUrl}">Quickstart</a>
        <a href="${repoUrl}">GitHub</a>
      </nav>
    </div>
  </header>

  <main>
    <!-- Section 1: Hero -->
    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-content">
          <h1>Raycast extensions, inside your app.</h1>
          <p>The engine builds and runs unmodified extensions, each command in its own process; you draw views and answer the capabilities you grant.</p>
          <div class="hero-actions">
            <a href="${demoUrl}" class="btn btn-primary">Try the live demo</a>
            <a href="${quickstartUrl}" class="btn btn-secondary">Quickstart</a>
          </div>
        </div>
        <div class="hero-media">
          <div class="wire-mock-card" aria-label="Mock list view next to protocol wire exchange">
            <div class="wire-mock-header">
              <span>View</span>
              <span>Wire Exchange (NDJSON)</span>
            </div>
            <div class="wire-mock-split">
              <div class="mock-view">
                <div class="mock-search-bar">&#128269; Search&hellip;</div>
                <ul class="mock-list">
                  <li class="mock-item active">
                    <span>Apple</span>
                  </li>
                  <li class="mock-item">
                    <span>Banana</span>
                  </li>
                  <li class="mock-item">
                    <span>Cherry</span>
                  </li>
                </ul>
              </div>
              <div class="mock-wire">
                <pre><span class="wire-in">→ {"type":"hello","protocol":1,"capabilities":["clipboard.copy"]}</span>
<span class="wire-out">← {"type":"welcome","protocol":1,…}</span>
<span class="wire-in">→ {"type":"request","id":"2","method":"extension.launch","params":{"extension":"1","command":"index","views":{"platform":"macOS"}}}</span>
<span class="wire-out">← {"type":"event","event":"session.view","session":"2","view":{"kind":"list","rows":[…]}}</span></pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 2: The whole integration -->
    <section class="integration" id="integration">
      <div class="container">
        <h2 class="section-title">The whole integration</h2>
        <p class="section-desc">Connect, launch, draw views, and forward user interactions in a few lines of code in your language of choice.</p>

        <div class="tab-group">
          <!-- Radio inputs for CSS-only tab switching -->
          <input type="radio" id="tab-js" name="tab-lang" class="tab-radio" checked aria-controls="panel-js">
          <input type="radio" id="tab-go" name="tab-lang" class="tab-radio" aria-controls="panel-go">
          <input type="radio" id="tab-py" name="tab-lang" class="tab-radio" aria-controls="panel-py">
          <input type="radio" id="tab-swift" name="tab-lang" class="tab-radio" aria-controls="panel-swift">
          <input type="radio" id="tab-ndjson" name="tab-lang" class="tab-radio" aria-controls="panel-ndjson">

          <div class="tab-nav" role="tablist" aria-label="Integration code examples">
            <label for="tab-js" id="label-js" role="tab">JavaScript</label>
            <label for="tab-go" id="label-go" role="tab">Go</label>
            <label for="tab-py" id="label-py" role="tab">Python</label>
            <label for="tab-swift" id="label-swift" role="tab">Swift</label>
            <label for="tab-ndjson" id="label-ndjson" role="tab">NDJSON</label>
          </div>

          <div class="tab-panels">
            <div class="tab-panel panel-js" id="panel-js" role="tabpanel" aria-labelledby="label-js">
              <pre><code>${jsSnippet}</code></pre>
            </div>

            <div class="tab-panel panel-go" id="panel-go" role="tabpanel" aria-labelledby="label-go">
              <pre><code>${goSnippet}</code></pre>
              <p class="tab-caption">Client from examples/go-embedder</p>
            </div>

            <div class="tab-panel panel-py" id="panel-py" role="tabpanel" aria-labelledby="label-py">
              <pre><code>${pySnippet}</code></pre>
              <p class="tab-caption">Standard library only</p>
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
    </section>

    <!-- Section 3: What Blast does / what you do -->
    <section class="responsibilities">
      <div class="container">
        <h2 class="section-title">What Blast does / what you do</h2>
        <p class="section-desc">A clean boundary between extension execution and your host application.</p>

        <div class="compare-grid">
          <div class="compare-col">
            <h3><span class="bullet-blast">&check;</span> What Blast does</h3>
            <ul class="compare-list">
              <li><strong>Extension lifecycle:</strong> Validates manifests, installs dependencies, and manages command sessions.</li>
              <li><strong>Bundling &amp; runtime:</strong> Bundles TypeScript into isolated ESM and runs each command in its own process.</li>
              <li><strong>Raycast compatibility:</strong> Implements <code>@raycast/api</code> and <code>@raycast/utils</code>, measured against the latest <code>@raycast/api</code> (see Receipts).</li>
              <li><strong>UI reconciliation:</strong> Reconciles React views into a minimal, serializable tree structure.</li>
              <li><strong>Capability brokering:</strong> Mediates storage, clipboard, OAuth and AI access, through explicit grants.</li>
            </ul>
          </div>

          <div class="compare-col">
            <h3><span class="bullet-you">&rarr;</span> What you do</h3>
            <ul class="compare-list">
              <li><strong>Render views:</strong> Draw the view nodes (List, Detail, Form, Grid) in your app's native UI toolkit.</li>
              <li><strong>Forward input:</strong> Send search keystrokes, item selections, and button clicks back to the session.</li>
              <li><strong>Answer capabilities:</strong> Choose which capabilities to grant (clipboard, storage, OAuth) per your security policy.</li>
              <li><strong>Pick your transport:</strong> Embed directly in-process via TypeScript, or across processes via standard I/O.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 4: Runs everywhere -->
    <section class="platforms">
      <div class="container">
        <h2 class="section-title">Runs everywhere</h2>
        <p class="section-desc">Integrate Raycast extensions into any architecture, runtime environment, or platform.</p>

        <div class="cards-grid">
          <a href="https://github.com/blastlauncher/blast/tree/main/packages/host" class="card">
            <div>
              <h3>Node / Bun / Electron</h3>
              <p>In-process engine integration for JavaScript and TypeScript hosts with no separate process for the engine.</p>
            </div>
            <span class="card-link">Explore package &rarr;</span>
          </a>

          <a href="https://github.com/blastlauncher/blast/tree/main/packages/serve" class="card">
            <div>
              <h3>Any language via serve</h3>
              <p>Simple NDJSON protocol over standard I/O for Go, Python, Swift, or Rust.</p>
            </div>
            <span class="card-link">Explore serve &rarr;</span>
          </a>

          <a href="https://github.com/blastlauncher/blast/tree/main/examples/browser-demo" class="card">
            <div>
              <h3>Browser tab</h3>
              <p>Run extensions in a cross-origin sandboxed iframe (almostnode), loaded by URL with nothing installed.</p>
            </div>
            <span class="card-link">Explore browser demo &rarr;</span>
          </a>

          <a href="https://github.com/blastlauncher/blast/tree/main/packages/tui" class="card">
            <div>
              <h3>Terminal (TUI)</h3>
              <p>Full keyboard-driven terminal user interface rendering lists, grids, forms, and markdown details.</p>
            </div>
            <span class="card-link">Explore TUI &rarr;</span>
          </a>
        </div>
      </div>
    </section>

    <!-- Section 5: Receipts -->
    <section class="receipts">
      <div class="container">
        <h2 class="section-title">Receipts</h2>
        <p class="section-desc">Measured compatibility against real extensions from the public catalog.</p>

        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-value">${stats.coverage.percent}</div>
            <div class="stat-label">Raycast API covered (${stats.coverage.covered} of ${stats.coverage.total})</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.rendered.toLocaleString()}</div>
            <div class="stat-label">Catalog commands rendered</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.commands.toLocaleString()}</div>
            <div class="stat-label">Total catalog commands tested</div>
          </div>
        </div>

        <div class="receipts-links">
          <a href="${coverageUrl}" target="_blank" rel="noopener">Read the API Coverage Report &rarr;</a>
          <a href="${sweepUrl}" target="_blank" rel="noopener">Read the Full Sweep Results &rarr;</a>
        </div>
      </div>
    </section>

    <!-- Section 6: Install -->
    <section class="install">
      <div class="container">
        <h2 class="section-title">Install</h2>
        <p class="section-desc">Get started in your project today.</p>

        <div class="install-boxes">
          <div class="install-box">
            <div class="install-label">Engine Package (TypeScript / Node)</div>
            <div class="install-code">npm install @blastlauncher/engine@next</div>
          </div>
          <div class="install-box">
            <div class="install-label">Serve CLI (Any Language)</div>
            <div class="install-code">npx -p @blastlauncher/serve@next blast-serve</div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="container footer-inner">
      <p>Blast is open source (MIT) and in alpha.</p>
      <nav class="nav-links" aria-label="Footer Navigation">
        <a href="${demoUrl}">Demo</a>
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
