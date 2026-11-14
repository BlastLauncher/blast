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
async function nextEvent(reader: Reader, pending = ""): Promise<{ event: any; pending: string }> {
  let text = pending;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error("SSE ended");
    text += new TextDecoder().decode(chunk.value);
    const split = text.indexOf("\n\n");
    if (split < 0) continue;
    const line = text
      .slice(0, split)
      .split("\n")
      .find((value) => value.startsWith("data: "));
    if (line) return { event: JSON.parse(line.slice(6)), pending: text.slice(split + 2) };
    text = text.slice(split + 2);
  }
}

describe("web launcher", () => {
  test("streams views, accepts input, forwards clipboard effects, and rejects bad requests", async () => {
    launcher = await startWebLauncher({ extensionDir: "./fixtures/extensions/hello-list" });
    const stream = await fetch(endpoint("/events", launcher.token));
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-security-policy")).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
    );
    expect(stream.headers.get("referrer-policy")).toBe("no-referrer");
    expect(stream.headers.get("x-content-type-options")).toBe("nosniff");
    const reader = stream.body!.getReader();
    let pending = "";
    let event;
    for (;;) {
      const next = await nextEvent(reader, pending);
      event = next.event;
      pending = next.pending;
      if (event.type === "view" && event.view.kind === "list") break;
    }
    expect(event.view.rows.length).toBeGreaterThan(0);
    await fetch(endpoint("/input", launcher.token), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "primary" }),
    });
    for (;;) {
      const next = await nextEvent(reader, pending);
      event = next.event;
      pending = next.pending;
      if (event.type === "view" && event.view.kind === "list") break;
    }
    const inputResponse = await fetch(endpoint("/input", launcher.token), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "search", text: "apple" }),
    });
    expect(inputResponse.status).toBe(204);
    expect(await inputResponse.text()).toBe("");
    expect(
      (
        await fetch(endpoint("/input", launcher.token), {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "{}",
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await fetch(endpoint("/input", "wrong"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(endpoint("/input", launcher.token), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{invalid",
        })
      ).status,
    ).toBe(400);
    await fetch(endpoint("/input", launcher.token), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "primary" }),
    });
    let effect;
    for (;;) {
      const next = await nextEvent(reader, pending);
      pending = next.pending;
      if (next.event.type === "effect") {
        effect = next.event;
        break;
      }
    }
    expect(effect).toMatchObject({ type: "effect", name: "clipboard.copy" });
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
