import { expect, test } from "bun:test";
import { handleRequest } from "./index.ts";
const env = {
  ALLOWED_ORIGINS: "https://example.com",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
};
const base = {
  origin: "https://example.com",
  "sec-fetch-mode": "cors",
  "cf-connecting-ip": "1.2.3.4",
};
function req(
  target = "https://api.example.org/a",
  headers: Record<string, string> = base,
  init: RequestInit = {},
) {
  return new Request(`https://proxy.example/v1?url=${encodeURIComponent(target)}`, {
    ...init,
    headers,
  });
}
const ok = async () => new Response("ok");
test("forwards stripped headers and returns CORS", async () => {
  const response = await handleRequest(
    req(undefined, {
      ...base,
      cookie: "x",
      referer: "https://example.com",
      "x-forwarded-for": "x",
      "x-real-ip": "x",
      authorization: "token",
    }),
    env,
    async (_url, init) => {
      const h = new Headers(init?.headers);
      expect(h.get("cookie")).toBeNull();
      expect(h.get("origin")).toBeNull();
      expect(h.get("x-forwarded-for")).toBeNull();
      expect(h.get("authorization")).toBe("token");
      return new Response("ok", { headers: { "set-cookie": "x", "x-result": "yes" } });
    },
  );
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("access-control-allow-origin")).toBe(base.origin);
  expect(response.headers.get("x-result")).toBe("yes");
});
test("rejects origin, mode and unsafe destinations", async () => {
  for (const origin of ["", "null", "https://evil.example"])
    expect((await handleRequest(req(undefined, { ...base, origin }), env, ok)).status).toBe(403);
  expect((await handleRequest(req(undefined, { "sec-fetch-mode": "cors" }), env, ok)).status).toBe(
    403,
  );
  expect((await handleRequest(req(undefined, { origin: base.origin }), env, ok)).status).toBe(403);
  for (const target of [
    "http://example.com",
    "https://example.com:444",
    "https://127.0.0.1",
    "https://10.0.0.1",
    "https://100.64.0.1",
    "https://[::1]",
    "https://[fc00::1]",
    "https://[::ffff:7f00:1]",
    "https://localhost",
    "https://foo.local",
    "https://foo.internal",
    "https://proxy.example",
  ])
    expect((await handleRequest(req(target), env, ok)).status).toBe(403);
});
test("redirects are validated and limited", async () => {
  expect(
    (
      await handleRequest(
        req(),
        env,
        async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1" } }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await handleRequest(
        req(),
        env,
        async () => new Response(null, { status: 302, headers: { location: "/again" } }),
      )
    ).status,
  ).toBe(502);
});
test("limits bodies and rate", async () => {
  expect(
    (
      await handleRequest(
        req(),
        { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } },
        ok,
      )
    ).status,
  ).toBe(429);
  expect(
    (
      await handleRequest(
        req(undefined, base, { method: "POST", body: "x".repeat(1048577) }),
        env,
        ok,
      )
    ).status,
  ).toBe(413);
  expect(
    (await handleRequest(req(), env, async () => new Response("x".repeat(10485761)))).status,
  ).toBe(502);
});
test("preflight and policy", async () => {
  const response = await handleRequest(
    req(
      undefined,
      {
        ...base,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization",
      },
      { method: "OPTIONS" },
    ),
    env,
    ok,
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-methods")).toBe("POST");
  expect(response.headers.get("access-control-max-age")).toBe("600");
  expect(
    await (await handleRequest(new Request("https://proxy.example/"), env, ok)).text(),
  ).toContain("Do not send secrets");
});
