export default function isolationProbe() {
  let dom = "blocked";
  let storage = "blocked";
  try {
    dom = typeof (globalThis as { parent?: { document?: unknown } }).parent?.document;
  } catch {
    // Cross-origin access must throw rather than expose the host document.
  }
  try {
    storage = typeof (globalThis as { parent?: { localStorage?: unknown } }).parent?.localStorage;
  } catch {
    // Cross-origin access must throw rather than expose host storage.
  }
  return { dom, storage, cookie: document.cookie };
}
