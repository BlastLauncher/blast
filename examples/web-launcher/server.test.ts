import { afterEach, describe, expect, test } from "bun:test";
import { startWebLauncher, type WebLauncher } from "./server.ts";

let launcher: WebLauncher | undefined;
afterEach(async () => {
  await launcher?.close();
  launcher = undefined;
});
const endpoint = (path: string, token: string) =>
  `http://127.0.0.1:${new URL(launcher!.url).port}${path}?t=${token}`;
type Reader = { read(): Promise<{ done: boolean; value?: Uint8Array }> };
type View = {
  kind: string;
  title: string;
  search: { text: string };
  rows: Array<{ kind: string; title: string }>;
};
type Event = { type: "view"; view: View } | { type: "effect"; name: string; params: unknown };

/** Reads the SSE stream until an event matches, skipping the ones before it. */
function events(reader: Reader) {
  let text = "";
  const decoder = new TextDecoder();
  return async function next(match: (event: Event) => boolean): Promise<Event> {
    for (;;) {
      let split = text.indexOf("\n\n");
      while (split >= 0) {
        const line = text
          .slice(0, split)
          .split("\n")
          .find((value) => value.startsWith("data: "));
        text = text.slice(split + 2);
        if (line) {
          const event = JSON.parse(line.slice(6)) as Event;
          if (match(event)) return event;
        }
        split = text.indexOf("\n\n");
      }
      const chunk = await reader.read();
      if (chunk.done) throw new Error("SSE ended");
      text += decoder.decode(chunk.value, { stream: true });
    }
  };
}
const viewWhere = (match: (view: View) => boolean) => (event: Event) =>
  event.type === "view" && match(event.view);
const titles = (view: View) => view.rows.map((row) => `${row.kind}:${row.title}`).join(",");
const isRoot = (view: View) =>
  view.title === "Commands" && titles(view) === "section:hello-list,item:index";
const post = (path: string, token: string, body: string, contentType = "application/json") =>
  fetch(endpoint(path, token), { method: "POST", headers: { "content-type": contentType }, body });
const input = async (value: unknown) => {
  const response = await post("/input", launcher!.token, JSON.stringify(value));
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
};

describe("web launcher", () => {
  test("starts on the root, launches a command, routes its input and effects, and goes back", async () => {
    launcher = await startWebLauncher({ extensionDir: "./fixtures/extensions/hello-list" });
    const stream = await fetch(endpoint("/events", launcher.token));
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-security-policy")).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
    );
    expect(stream.headers.get("referrer-policy")).toBe("no-referrer");
    expect(stream.headers.get("x-content-type-options")).toBe("nosniff");
    const reader = stream.body!.getReader();
    const next = events(reader);

    // The root lists the extension's commands; primary launches the selected one.
    await next(viewWhere(isRoot));
    await input({ type: "primary" });
    await next(viewWhere((view) => titles(view) === "item:apple,item:banana,item:cherry"));

    // Input now reaches the command: its search filters the rows, primary copies.
    await input({ type: "search", text: "ban" });
    await next(viewWhere((view) => view.search.text === "ban" && titles(view) === "item:banana"));
    await input({ type: "primary" });
    expect(await next((event) => event.type === "effect")).toEqual({
      type: "effect",
      name: "clipboard.copy",
      params: { text: "banana" },
    });

    // Back at the command's root closes it and the root view returns.
    await input({ type: "back" });
    await next(viewWhere(isRoot));

    expect((await post("/input", launcher.token, "{}", "text/plain")).status).toBe(415);
    expect((await post("/input", "wrong", "{}")).status).toBe(403);
    expect((await post("/input", launcher.token, "{invalid")).status).toBe(400);
    expect((await post("/launch", launcher.token, "{}")).status).toBe(400);
    await reader.cancel();
  });

  test("requires the token on every endpoint", async () => {
    launcher = await startWebLauncher({ extensionDir: "./fixtures/extensions/hello-list" });
    for (const request of [
      fetch(endpoint("/", "bad")),
      fetch(endpoint("/events", "bad")),
      fetch(endpoint("/input", "bad"), { method: "POST" }),
      fetch(endpoint("/launch", "bad"), { method: "POST" }),
    ])
      expect((await request).status).toBe(403);
  });

  test("serves the page scripts without a token, as a browser requests them", async () => {
    launcher = await startWebLauncher({ extensionDir: "./fixtures/extensions/hello-list" });
    const html = await (await fetch(endpoint("/", launcher.token))).text();
    expect(html).toContain('src="/client.js"');
    const origin = new URL(launcher.url).origin;
    for (const path of ["/client.js", "/render.js"]) {
      const response = await fetch(origin + path);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("javascript");
    }
    const client = await (await fetch(origin + "/client.js")).text();
    expect(client).toContain('from "./render.js"');
    expect((await fetch(origin + "/client.js", { headers: { host: "localhost" } })).status).toBe(
      403,
    );
  });

  test("rejects a Host header that is not the bound loopback address", async () => {
    launcher = await startWebLauncher({ extensionDir: "./fixtures/extensions/hello-list" });
    const response = await fetch(endpoint("/", launcher.token), { headers: { host: "localhost" } });
    expect(response.status).toBe(403);
  });
});
