type Env = {
  ALLOWED_ORIGINS: string;
  RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
};
const REQUEST_LIMIT = 1024 * 1024;
const RESPONSE_LIMIT = 10 * 1024 * 1024;

function validTarget(url: URL, proxy: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    host === proxy.hostname.toLowerCase() ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return false;
  if (host.startsWith("[")) {
    const ip = host.slice(1, -1);
    // URL normalizes IPv6 and IPv4-mapped addresses to hexadecimal.
    if (ip === "::" || ip === "::1" || /^(fc|fd|fe8|fe9|fea|feb)/.test(ip)) return false;
    if (ip.startsWith("::ffff:")) {
      const parts = ip
        .slice(7)
        .split(":")
        .map((part) => parseInt(part, 16));
      return publicV4([parts[0]! >> 8, parts[0]! & 255, parts[1]! >> 8, parts[1]! & 255]);
    }
  } else if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return publicV4(host.split(".").map(Number));
  return true;
}
function publicV4(p: number[]): boolean {
  const [a = 0, b = 0] = p;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}
async function bounded(
  body: ReadableStream<Uint8Array> | null,
  length: string | null,
  limit: number,
): Promise<Uint8Array | null> {
  if (length && Number(length) > limit) throw new Error("size");
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        throw new Error("size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function handleRequest(
  request: Request,
  env: Env,
  upstream: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<Response> {
  const proxy = new URL(request.url);
  const origin = request.headers.get("origin");
  const allowed =
    origin !== null &&
    origin !== "null" &&
    env.ALLOWED_ORIGINS.split(",")
      .map((s) => s.trim())
      .includes(origin);
  const cors = new Headers({ Vary: "Origin" });
  if (allowed) cors.set("Access-Control-Allow-Origin", origin);
  const reply = (body: string | null, status: number) =>
    new Response(body, { status, headers: cors });
  if (proxy.pathname === "/" && request.method === "GET")
    return reply(
      "HTTPS requests are forwarded without logging or storage. Do not send secrets. Source: https://github.com/blastlauncher/blast/tree/main/packages/cors-proxy\n",
      200,
    );
  if (!allowed) return reply("Origin denied", 403);
  if (request.headers.get("sec-fetch-mode") !== "cors") return reply("Invalid fetch mode", 403);
  if (request.method === "OPTIONS") {
    cors.set(
      "Access-Control-Allow-Methods",
      request.headers.get("access-control-request-method") ?? "",
    );
    cors.set(
      "Access-Control-Allow-Headers",
      request.headers.get("access-control-request-headers") ?? "",
    );
    cors.set("Access-Control-Max-Age", "600");
    return reply(null, 204);
  }
  if (proxy.pathname !== "/v1") return reply("Invalid path", 400);
  let target: URL;
  try {
    target = new URL(proxy.searchParams.get("url") ?? "");
  } catch {
    return reply("Invalid URL", 400);
  }
  if (!validTarget(target, proxy)) return reply("Target denied", 403);
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip || !(await env.RATE_LIMITER.limit({ key: ip })).success)
    return reply("Rate limited", 429);
  let body: Uint8Array | null;
  try {
    body = await bounded(request.body, request.headers.get("content-length"), REQUEST_LIMIT);
  } catch {
    return reply("Request too large", 413);
  }
  const headers = new Headers(request.headers);
  for (const key of Array.from(headers.keys()))
    if (
      ["cookie", "origin", "referer", "host", "x-real-ip", "content-length"].includes(key) ||
      key.startsWith("cf-") ||
      key.startsWith("x-forwarded-") ||
      key.startsWith("sec-fetch-")
    )
      headers.delete(key);
  let method = request.method;
  for (let hop = 0; hop <= 5; hop++) {
    let response: Response;
    try {
      response = await upstream(target.toString(), {
        method,
        headers,
        body: body as never,
        redirect: "manual",
      });
    } catch {
      return reply("Upstream failed", 502);
    }
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.has("location")) {
      if (hop === 5) return reply("Too many redirects", 502);
      try {
        const next = new URL(response.headers.get("location")!, target);
        if (!validTarget(next, proxy)) return reply("Target denied", 403);
        if (next.origin !== target.origin) {
          headers.delete("authorization");
          headers.delete("proxy-authorization");
        }
        target = next;
      } catch {
        return reply("Invalid redirect", 502);
      }
      if (
        (response.status === 303 && method !== "HEAD") ||
        ((response.status === 301 || response.status === 302) && method === "POST")
      ) {
        method = "GET";
        body = null;
        headers.delete("content-type");
      }
      await response.body?.cancel();
      continue;
    }
    let data: Uint8Array | null;
    try {
      data = await bounded(response.body, response.headers.get("content-length"), RESPONSE_LIMIT);
    } catch {
      return reply("Response too large", 502);
    }
    const out = new Headers(response.headers);
    out.delete("set-cookie");
    out.delete("set-cookie2");
    out.delete("content-length");
    for (const key of Array.from(out.keys()))
      if (key.startsWith("access-control-")) out.delete(key);
    out.set("Access-Control-Allow-Origin", origin);
    out.set("Access-Control-Expose-Headers", "*");
    out.append("Vary", "Origin");
    return new Response(data as never, {
      status: response.status,
      statusText: response.statusText,
      headers: out,
    });
  }
  return reply("Too many redirects", 502);
}
export default { fetch: (request: Request, env: Env) => handleRequest(request, env) };
