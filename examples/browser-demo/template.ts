export function demoPage(sandboxUrl: string, base = "./", fixtures = false): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="${base}demo.css"><title>Blast browser demo</title></head><body><p id="status">Loading catalog…</p><div id="app"></div><script>window.__BLAST_SANDBOX__=${JSON.stringify(sandboxUrl)};window.__BLAST_FIXTURES__=${fixtures}</script><script type="module" src="${base}client.js"></script></body></html>`;
}
