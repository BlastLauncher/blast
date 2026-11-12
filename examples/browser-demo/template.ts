const escapeAttribute = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/**
 * The demo page: a slim bar that says where the visitor is and links home, over
 * a quiet backdrop that the launcher window sits on. `home` is the landing page.
 */
export function demoPage(sandboxUrl: string, base = "./", fixtures = false, home = "/"): string {
  const bar = `<div class="demo-bar" role="banner"><a class="demo-home" href="${escapeAttribute(home)}"><i aria-hidden="true"></i>Blast</a><span class="demo-label">Browser demo · alpha</span><p class="demo-note">Raycast-compatible extensions, running in a sandboxed browser tab.</p><a class="demo-github" href="https://github.com/blastlauncher/blast">GitHub</a></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><link rel="stylesheet" href="${base}demo.css"><title>Blast browser demo</title></head><body>${bar}<div id="app"></div><script>window.__BLAST_SANDBOX__=${JSON.stringify(sandboxUrl)};window.__BLAST_FIXTURES__=${fixtures}</script><script type="module" src="${base}client.js"></script></body></html>`;
}
