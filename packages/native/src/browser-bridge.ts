import { WebSocket, WebSocketServer } from "ws";
import type { JsonValue } from "@blastlauncher/protocol";
import type { CapabilityHandler } from "./index.ts";

type Pending = {
  socket: WebSocket;
  finish(error?: Error, result?: unknown): void;
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validRequestId = (id: unknown): id is string | number | null =>
  id === null || typeof id === "string" || typeof id === "number";
const parseResponseId = (id: unknown): number | undefined => {
  if (typeof id === "number" && Number.isInteger(id)) return id;
  if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
  return undefined;
};

/** Serves the companion protocol only on IPv4 loopback; no browser data is cached. */
export async function startBrowserBridge({
  port,
  allowedOrigins = [],
  timeoutMs = 10_000,
}: {
  port: number;
  allowedOrigins?: readonly string[];
  timeoutMs?: number;
}): Promise<{
  host: string;
  port: number;
  handlers: Record<string, CapabilityHandler>;
  close(): Promise<void>;
}> {
  const server = new WebSocketServer({
    host: "127.0.0.1",
    port,
    verifyClient: ({ origin }, done) => {
      const allowed =
        typeof origin === "string" &&
        origin !== "null" &&
        origin !== "" &&
        (/^(chrome-extension|moz-extension|safari-web-extension):\/\/[^/\s?#]+$/.test(origin) ||
          allowedOrigins.includes(origin));
      done(allowed, 403, "Browser extension Origin required");
    },
  });
  const clients: WebSocket[] = [];
  let nextId = 1;
  let closed = false;
  const pending = new Map<number, Pending>();
  const fail = (socket: WebSocket, message: string) => {
    for (const request of pending.values())
      if (request.socket === socket) request.finish(new Error(message));
  };
  server.on("connection", (socket) => {
    clients.push(socket);
    socket.on("error", () => fail(socket, "Browser companion extension connection failed"));
    socket.on("close", () => {
      const index = clients.indexOf(socket);
      if (index !== -1) clients.splice(index, 1);
      fail(socket, "Browser companion extension disconnected");
    });
    socket.on("message", (raw) => {
      let message: unknown;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!record(message) || message.jsonrpc !== "2.0" || message.id === undefined) return;
      if (typeof message.method === "string") {
        if (!validRequestId(message.id)) return;
        socket.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            ...(message.method === "ping"
              ? { result: "pong" }
              : { error: { code: -32601, message: "Method not found" } }),
          }),
          () => {},
        );
        return;
      }
      const id = parseResponseId(message.id);
      if (id === undefined) return;
      const request = pending.get(id);
      if (!request || request.socket !== socket) return;
      if (record(message.error))
        request.finish(
          new Error(
            typeof message.error.message === "string"
              ? message.error.message
              : "Browser companion extension request failed",
          ),
        );
      else request.finish(undefined, message.result);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", (error: NodeJS.ErrnoException) => {
      reject(
        error.code === "EADDRINUSE"
          ? new Error(
              `Browser bridge port ${port} is already in use; choose another with --browser-bridge <port>`,
            )
          : error,
      );
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Browser bridge has no address");
  function activeClient(): WebSocket | undefined {
    for (let i = clients.length - 1; i >= 0; i--)
      if (clients[i]!.readyState === WebSocket.OPEN) return clients[i];
    return undefined;
  }
  function rpcRequest(method: string, params: Record<string, JsonValue> = {}): Promise<unknown> {
    const socket = activeClient();
    if (closed || !socket)
      return Promise.reject(
        new Error("Install and enable the browser companion extension to use BrowserExtension"),
      );
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(
        () =>
          finish(new Error(`Browser companion extension ${method} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      const finish = (error?: Error, result?: unknown) => {
        if (!pending.delete(id)) return;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result);
      };
      pending.set(id, { socket, finish });
      socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }), (error) => {
        if (error) finish(error);
      });
    });
  }
  const handlers: Record<string, CapabilityHandler> = {
    "browser.tabs": async () => {
      const result = await rpcRequest("getTabs");
      if (!record(result) || !Array.isArray(result.value))
        throw new Error("Browser getTabs returned invalid tabs");
      return result.value.flatMap((tab: unknown) => {
        if (!record(tab) || !Number.isInteger(tab.tabId) || typeof tab.url !== "string") return [];
        const mapped: Record<string, JsonValue> = {
          id: tab.tabId as number,
          url: tab.url,
          active: tab.active === true,
        };
        for (const key of ["title", "favicon"] as const)
          if (typeof tab[key] === "string") mapped[key] = tab[key];
        return [mapped];
      });
    },
    "browser.content": async (params) => {
      if (!record(params)) throw new Error("browser.content: expected options");
      const forwarded: Record<string, JsonValue> = { field: "content" };
      for (const key of ["tabId", "format", "cssSelector"] as const)
        if (params[key] !== undefined)
          forwarded[key === "cssSelector" ? "selector" : key] = params[key];
      const result = await rpcRequest("getTab", forwarded);
      if (!record(result) || typeof result.value !== "string")
        throw new Error("Browser getTab returned invalid content");
      return result.value;
    },
  };
  let closing: Promise<void> | undefined;
  return {
    host: address.address,
    port: address.port,
    handlers,
    close() {
      closing ??= new Promise<void>((resolve, reject) => {
        closed = true;
        for (const request of pending.values()) request.finish(new Error("Browser bridge closed"));
        for (const socket of server.clients) socket.terminate();
        server.close((error) => (error ? reject(error) : resolve()));
      });
      return closing;
    },
  };
}
