import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const output = join(root, "examples/macos-launcher/Tests/Fixtures");
const cases = [
  ["list", "fixtures/extensions/hello-list", "index"],
  ["grid", "fixtures/extensions/grid", "index"],
  ["detail", "fixtures/extensions/assets", "index"],
  ["form", "fixtures/extensions/form", "index"],
  ["menu-bar", "fixtures/extensions/menu-bar", "index"],
  ["toast", "fixtures/extensions/feedback", "index"],
  ["action-panel", "fixtures/extensions/actions-variants", "index"],
] as const;

type Message = Record<string, unknown>;
async function capture(dir: string, command: string): Promise<Message> {
  const child = spawn("node", ["packages/serve/src/main.ts"], { cwd: root, stdio: ["pipe", "pipe", "inherit"] });
  let pending = "";
  const messages: Message[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    pending += chunk.toString();
    for (;;) {
      const newline = pending.indexOf("\n");
      if (newline < 0) break;
      const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
      if (line.trim()) messages.push(JSON.parse(line) as Message);
    }
  });
  const send = (value: Message) => child.stdin.write(`${JSON.stringify(value)}\n`);
  send({ type: "hello", protocol: 1, capabilities: [] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("serve handshake timed out")), 30_000);
    const poll = setInterval(() => { if (messages.some((m) => m.type === "welcome")) { clearInterval(poll); clearTimeout(timer); resolve(); } }, 5);
  });
  send({ type: "request", id: "1", method: "extension.open", params: { dir } });
  await new Promise<void>((resolve) => { const poll=setInterval(() => { if (messages.some((m) => m.type === "response" && m.id === "1")) { clearInterval(poll); resolve(); } }, 5); });
  send({ type: "request", id: "2", method: "extension.launch", params: { extension: "1", command, views: { platform: "macOS" } } });
  return await new Promise<Message>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no view for ${dir}`)), 30_000);
    const poll = setInterval(() => { const found = messages.find((m) => m.type === "event" && m.event === "session.view"); if (found) { clearInterval(poll); clearTimeout(timer); send({ type: "request", id: "3", method: "engine.shutdown", params: {} }); resolve(found.view as Message); } }, 5);
  });
}

await mkdir(output, { recursive: true });
for (const [name, dir, command] of cases) {
  const view = await capture(dir, command);
  const json = `${JSON.stringify(view)}\n`;
  const path = join(output, `${name}.json`);
  let previous = ""; try { previous = await readFile(path, "utf8"); } catch {}
  if (previous !== json) await writeFile(path, json);
}
