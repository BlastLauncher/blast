import { afterEach, expect, test } from "bun:test";
import { once } from "node:events";
import { WebSocket } from "ws";
import { startBrowserBridge } from "./index.ts";

const bridges: Awaited<ReturnType<typeof startBrowserBridge>>[] = [];
afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.close()));
});
async function start(options = {}) {
  const bridge = await startBrowserBridge({ port: 0, ...options });
  bridges.push(bridge);
  return bridge;
}
async function connect(port: number, origin = "chrome-extension://abc") {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: origin } });
  socket.on("error", () => {});
  await once(socket, "open");
  return socket;
}
function answer(socket: WebSocket, value: unknown) {
  socket.on("message", (raw) => {
    const { id } = JSON.parse(raw.toString());
    socket.send(JSON.stringify({ jsonrpc: "2.0", id, result: { value } }));
  });
}

test("tab mapping drops missing ids/urls and extra fields", async () => {
  const bridge = await start();
  const socket = await connect(bridge.port);
  answer(socket, [
    {
      tabId: 4,
      url: "https://example.com",
      title: "Example",
      favicon: "icon",
      active: true,
      windowId: 8,
    },
    { tabId: 5, url: "https://other.example", active: false },
    { url: "missing id" },
    { tabId: 7 },
    null,
  ]);
  expect(await bridge.handlers["browser.tabs"]!({})).toEqual([
    { id: 4, url: "https://example.com", title: "Example", favicon: "icon", active: true },
    { id: 5, url: "https://other.example", active: false },
  ]);
});

// @covers BrowserExtension.getContent
test("content forwards tabId, formats and CSS selector through getTab", async () => {
  const bridge = await start();
  const socket = await connect(bridge.port);
  const received: unknown[] = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    received.push({ method: message.method, params: message.params });
    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: { value: `content:${message.params.format}` },
      }),
    );
  });
  for (const format of ["text", "html", "markdown"]) {
    const params = { tabId: 4, format, ...(format === "markdown" ? {} : { cssSelector: "main" }) };
    expect(await bridge.handlers["browser.content"]!(params)).toBe(`content:${format}`);
    expect(received.at(-1)).toEqual({
      method: "getTab",
      params: {
        field: "content",
        tabId: 4,
        format,
        ...(format === "markdown" ? {} : { selector: "main" }),
      },
    });
  }
  expect(await bridge.handlers["browser.content"]!({})).toBe("content:undefined");
  expect(received.at(-1)).toEqual({ method: "getTab", params: { field: "content" } });
});

test("RPC errors propagate and missing clients explain setup", async () => {
  const bridge = await start();
  await expect(bridge.handlers["browser.tabs"]!({})).rejects.toThrow("companion extension");
  const socket = await connect(bridge.port);
  socket.once("message", (raw) => {
    const { id } = JSON.parse(raw.toString());
    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: "Cannot read restricted page" },
      }),
    );
  });
  await expect(bridge.handlers["browser.content"]!({})).rejects.toThrow(
    "Cannot read restricted page",
  );
});

test("unanswered RPC requests reject after the configured timeout", async () => {
  const bridge = await start({ timeoutMs: 25 });
  await connect(bridge.port);
  await expect(bridge.handlers["browser.tabs"]!({})).rejects.toThrow(
    "getTabs timed out after 25ms",
  );
});

test("ping is answered; notifications, malformed frames and object IDs are ignored safely", async () => {
  const bridge = await start();
  const socket = await connect(bridge.port);
  socket.send("not json");
  socket.send("null");
  socket.send(JSON.stringify({ jsonrpc: "2.0", id: { toString: null }, result: { value: "bad" } }));
  socket.send(JSON.stringify({ jsonrpc: "2.0", id: {}, method: "ping" }));
  socket.send(
    JSON.stringify({ jsonrpc: "2.0", method: "whoami", params: { name: "browserExtension" } }),
  );
  const reply = once(socket, "message");
  socket.send(JSON.stringify({ jsonrpc: "2.0", method: "ping", id: "keepalive" }));
  expect(JSON.parse((await reply)[0].toString())).toEqual({
    jsonrpc: "2.0",
    id: "keepalive",
    result: "pong",
  });
});

test("latest client wins; closing an older keeps latest, closing latest restores older", async () => {
  const bridge = await start();
  const first = await connect(bridge.port);
  answer(first, "first");
  const second = await connect(bridge.port, "moz-extension://second");
  answer(second, "second");
  const third = await connect(bridge.port, "moz-extension://third");
  answer(third, "third");
  expect(await bridge.handlers["browser.content"]!({})).toBe("third");
  const firstClosed = once(first, "close");
  first.close();
  await firstClosed;
  expect(await bridge.handlers["browser.content"]!({})).toBe("third");
  const thirdClosed = once(third, "close");
  third.close();
  await thirdClosed;
  // Client "close" can resolve before the server socket observes EOF on loopback.
  let fallback: unknown;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      fallback = await bridge.handlers["browser.content"]!({});
      break;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("disconnected")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  expect(fallback).toBe("second");
});

test("disconnect and bridge close reject pending requests and close is idempotent", async () => {
  const bridge = await start();
  const socket = await connect(bridge.port);
  socket.once("message", () => socket.terminate());
  await expect(bridge.handlers["browser.tabs"]!({})).rejects.toThrow("disconnected");
  await connect(bridge.port);
  const pending = bridge.handlers["browser.tabs"]!({}) as Promise<unknown>;
  void pending.catch(() => {});
  await bridge.close();
  await expect(pending).rejects.toThrow("bridge closed");
  await bridge.close();
});

test("origin gate rejects web, null and missing origins even if allowlisted", async () => {
  const bridge = await start({ allowedOrigins: ["null", ""] });
  for (const origin of ["https://evil.example", "null", undefined]) {
    const socket = new WebSocket(
      `ws://127.0.0.1:${bridge.port}`,
      origin === undefined ? {} : { headers: { Origin: origin } },
    );
    socket.on("error", () => {});
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    const error = await new Promise<Error>((resolve) => socket.once("error", resolve));
    expect(error.message).toMatch(/403|Expected 101 status code/);
    await closed;
  }
});

test("server binds 127.0.0.1 only and accepts extension and allowlisted origins", async () => {
  const bridge = await start({ allowedOrigins: ["https://trusted.example"] });
  expect(bridge.host).toBe("127.0.0.1");
  for (const origin of [
    "chrome-extension://abc",
    "moz-extension://abc",
    "safari-web-extension://abc",
    "https://trusted.example",
  ]) {
    const socket = await connect(bridge.port, origin);
    const closed = once(socket, "close");
    socket.close();
    await closed;
  }
});

test("occupied port names the port and suggests another", async () => {
  const bridge = await start();
  await expect(startBrowserBridge({ port: bridge.port })).rejects.toThrow(
    `port ${bridge.port} is already in use; choose another`,
  );
});
