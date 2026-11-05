import { readFile } from "node:fs/promises";

export const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Blast</title><style>body{font:16px system-ui;max-width:720px;margin:3rem auto;background:#111;color:#eee}input{background:#222;color:inherit;border:1px solid #555;padding:.6rem;width:100%;box-sizing:border-box}li{list-style:none;padding:.5rem}.rows,.actions ul{padding:0}.selected{background:#345;border-radius:.3rem}.actions,.toast{padding:1rem;background:#222;margin-top:1rem}.detail{white-space:pre-wrap}.empty{padding:1rem;color:#aaa}footer{margin-top:1rem}</style></head><body><div id="app"></div><script type="module" src="/client.js"></script></body></html>`;

export const renderSource = () => readFile(new URL("./render.js", import.meta.url), "utf8");
export const clientSource = () => readFile(new URL("./client.js", import.meta.url), "utf8");
