import { expect, test } from "bun:test";
import { installFetchProxy } from "./fetch-proxy.ts";

const proxy = "https://proxy.example/v1?key=demo";
const target = "https://api.example/data?q=one&x=two#hash";
function setup() {
  const calls: Array<[string | Request | URL, RequestInit | undefined]> = [];
  class XHR {
    withCredentials = false;
    url = "";
    method = "";
    credentialsAtSend = false;
    open(method: string, url: string | URL) {
      this.method = method;
      this.url = String(url);
    }
    send(_body?: unknown) {
      this.credentialsAtSend = this.withCredentials;
    }
  }
  const scope = {
    location: { origin: "https://sandbox.example" },
    fetch: ((input, init) => {
      calls.push([input, init]);
      return Promise.resolve(new Response("ok"));
    }) as typeof fetch,
    XMLHttpRequest: XHR,
  };
  installFetchProxy(proxy, scope);
  return { scope, calls, XHR };
}
for (const url of [
  "/relative",
  "relative",
  "//api.example/path",
  "data:text/plain,hi",
  "blob:https://api.example/id",
  "https://sandbox.example/data",
  "https://proxy.example/other",
]) {
  test(`keeps ${url}`, async () => {
    const { scope, calls, XHR } = setup();
    await scope.fetch(url, { credentials: "include" });
    expect(calls[0]).toEqual([url, { credentials: "include" }]);
    const xhr = new XHR();
    xhr.open("GET", url);
    xhr.withCredentials = true;
    xhr.send();
    expect(xhr.url).toBe(url);
    expect(xhr.credentialsAtSend).toBe(true);
  });
}
for (const url of [target, "http://api.example/data", "http://127.0.0.1/data"]) {
  test(`rewrites ${url} for fetch and XHR`, async () => {
    const { scope, calls, XHR } = setup();
    await scope.fetch(new URL(url), {
      method: "POST",
      body: "payload",
      headers: { authorization: "test" },
      credentials: "include",
    });
    const actual = new URL(String(calls[0]![0]));
    expect(actual.searchParams.get("url")).toBe(url);
    expect(actual.searchParams.get("key")).toBe("demo");
    expect(calls[0]![1]).toEqual({
      method: "POST",
      body: "payload",
      headers: { authorization: "test" },
      credentials: "omit",
      mode: "cors",
    });
    const xhr = new XHR();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.send("payload");
    expect(xhr.url).toBe(actual.href);
    expect(xhr.method).toBe("POST");
    expect(xhr.credentialsAtSend).toBe(false);
    xhr.open("GET", "/same");
    xhr.withCredentials = true;
    xhr.send();
    expect(xhr.credentialsAtSend).toBe(true);
  });
}
test("Request preserves body, headers, method, signal and init overrides", async () => {
  const { scope, calls } = setup();
  const controller = new AbortController();
  const input = new Request(target, {
    method: "POST",
    body: "payload",
    headers: { authorization: "secret" },
    signal: controller.signal,
    credentials: "include",
  });
  await scope.fetch(input, { headers: { "x-test": "override" } });
  const sent = new Request(String(calls[0]![0]), calls[0]![1]);
  expect(new URL(sent.url).searchParams.get("url")).toBe(target);
  expect(sent.method).toBe("POST");
  expect(sent.headers.get("x-test")).toBe("override");
  expect(await sent.text()).toBe("payload");
  controller.abort();
  expect(sent.signal.aborted).toBe(true);
  expect(calls[0]![1]?.credentials).toBe("omit");
  expect(calls[0]![1]?.mode).toBe("cors");
  const second = setup();
  await second.scope.fetch(
    new Request(target, { method: "PUT", body: "bytes", headers: { authorization: "secret" } }),
  );
  expect(new Headers(second.calls[0]![1]?.headers).get("authorization")).toBe("secret");
});
