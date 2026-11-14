import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createEngine, type CapabilityHandler, type ExtensionHandle } from "@blastlauncher/host";
import { type ControllerInput, type ControllerView } from "@blastlauncher/client-core";
import type { JsonValue } from "@blastlauncher/protocol";
import { clientSource, pageHtml, renderSource } from "./page.ts";

export type WebLauncherOptions = { extensionDir: string; command?: string; port?: number };
export type WebLauncher = { url: string; token: string; server: Server; close(): Promise<void> };

type Client = ServerResponse;
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
async function readBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body too large");
  }
  return JSON.parse(body || "{}");
}
const securityHeaders = {
  "content-security-policy":
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
const respond = (response: ServerResponse, status: number, value?: unknown) => {
  const headers: Record<string, string> = { ...securityHeaders };
  if (status !== 204) headers["content-type"] = "application/json";
  response.writeHead(status, headers);
  response.end(status === 204 ? undefined : JSON.stringify(value));
};

export async function startWebLauncher(options: WebLauncherOptions): Promise<WebLauncher> {
  const token = randomBytes(18).toString("hex");
  const clients = new Set<Client>();
  let latest: ControllerView | undefined;
  let extension: ExtensionHandle | undefined;
  let root: ReturnType<ReturnType<typeof createEngine>["root"]> | undefined;
  let closed = false;
  let expectedHost = "";
  const engine = createEngine({ handlers: capabilityHandlers() });

  const emit = (message: unknown) => {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    for (const response of clients) response.write(data);
  };
  const update = (view: ControllerView) => {
    latest = view;
    emit({ type: "view", view });
  };
  const apply = (input: ControllerInput) => {
    root?.input(input);
  };
  function capabilityHandlers(): Record<string, CapabilityHandler> {
    return {
      "clipboard.copy": (params) => {
        emit({ type: "effect", name: "clipboard.copy", params: json(params) });
      },
      "open.url": (params) => {
        emit({ type: "effect", name: "open.url", params: json(params) });
      },
    };
  }
  const closeSession = async () => {
    await root?.close();
    root = undefined;
  };
  const launch = async (_command: string) => {
    await closeSession();
    extension ??= engine.openExtension({ extensionDir: options.extensionDir });
    root = engine.root({ views: { platform: "macOS" } });
    root.subscribe(update);
    await root.ready();
    update(root.view());
  };
  const publicAssets = new Set(["/client.js", "/render.js"]);
  const authorized = (request: IncomingMessage, response: ServerResponse) => {
    if (request.headers.host !== expectedHost) {
      respond(response, 403, { error: "Invalid host" });
      return false;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    // The page loads its scripts as `<script src="/client.js">` and
    // `import "./render.js"`, which carry no `?t=`. They are public static code,
    // so only the page, the event stream and the input endpoints need the token.
    if (request.method === "GET" && publicAssets.has(url.pathname)) return true;
    if (url.searchParams.get("t") !== token) {
      respond(response, 403, { error: "Forbidden" });
      return false;
    }
    return true;
  };
  const server = createServer(async (request, response) => {
    if (closed || !authorized(request, response)) return;
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, { ...securityHeaders, "content-type": "text/html; charset=utf-8" });
        response.end(pageHtml);
        return;
      }
      if (request.method === "GET" && url.pathname === "/render.js") {
        response.writeHead(200, {
          ...securityHeaders,
          "content-type": "text/javascript; charset=utf-8",
        });
        response.end(await renderSource());
        return;
      }
      if (request.method === "GET" && url.pathname === "/client.js") {
        response.writeHead(200, {
          ...securityHeaders,
          "content-type": "text/javascript; charset=utf-8",
        });
        response.end(await clientSource());
        return;
      }
      if (request.method === "GET" && url.pathname === "/events") {
        response.writeHead(200, {
          ...securityHeaders,
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        clients.add(response);
        request.on("close", () => clients.delete(response));
        if (latest) response.write(`data: ${JSON.stringify({ type: "view", view: latest })}\n\n`);
        return;
      }
      if (request.method === "POST" && ["/input", "/launch"].includes(url.pathname)) {
        if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
          respond(response, 415, { error: "JSON required" });
          return;
        }
        const body = await readBody(request);
        if (url.pathname === "/input") {
          if (!root) {
            respond(response, 409, { error: "No session" });
            return;
          }
          apply(body as ControllerInput);
          respond(response, 204, null);
          return;
        }
        const command =
          typeof body === "object" &&
          body !== null &&
          "command" in body &&
          typeof body.command === "string"
            ? body.command
            : undefined;
        if (!command) {
          respond(response, 400, { error: "command required" });
          return;
        }
        await launch(command);
        respond(response, 204, null);
        return;
      }
      response.writeHead(404, securityHeaders);
      response.end("Not found");
    } catch (error) {
      respond(response, error instanceof SyntaxError ? 400 : 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Web server did not bind to a port");
  expectedHost = `127.0.0.1:${address.port}`;
  const command =
    options.command ??
    (await (extension ??= engine.openExtension({ extensionDir: options.extensionDir })).manifest())
      .commands[0]?.name;
  if (!command) throw new Error("Extension has no commands");
  await launch(command);
  return {
    url: `http://127.0.0.1:${address.port}/?t=${token}`,
    token,
    server,
    close: async () => {
      if (closed) return;
      closed = true;
      for (const client of clients) client.end();
      clients.clear();
      await closeSession();
      await extension?.close();
      await engine.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export const createWebLauncher = startWebLauncher;
