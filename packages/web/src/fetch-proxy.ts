type XHR = {
  withCredentials: boolean;
  open(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void;
  send(body?: unknown): void;
};
type NetworkScope = {
  location: { origin: string };
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  XMLHttpRequest?: { prototype: XHR };
};

/** Self-contained so the host can install it through execute before loading any bundles. */
export function installFetchProxy(
  proxy: string,
  scope: NetworkScope = globalThis as unknown as NetworkScope,
): void {
  const endpoint = new URL(proxy);
  const rewrite = (value: string): string | undefined => {
    if (!/^https?:\/\//i.test(value)) return;
    const target = new URL(value);
    if (target.origin === scope.location.origin || target.origin === endpoint.origin) return;
    const url = new URL(endpoint);
    url.searchParams.set("url", value);
    return url.href;
  };
  const originalFetch = scope.fetch;
  scope.fetch = async function (input, init) {
    const url = rewrite(input instanceof Request ? input.url : String(input));
    if (!url) return originalFetch.call(scope, input, init);
    if (input instanceof Request) {
      const request = new Request(input, init);
      // A Request body is exposed as a stream. Buffer it so Chromium does not
      // require an HTTP/2 upstream for an otherwise ordinary POST.
      return originalFetch.call(scope, url, {
        method: request.method,
        headers: request.headers,
        body: request.body ? await request.arrayBuffer() : null,
        signal: request.signal,
        cache: request.cache,
        redirect: request.redirect,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
        integrity: request.integrity,
        keepalive: request.keepalive,
        credentials: "omit",
        mode: "cors",
      });
    }
    return originalFetch.call(scope, url, { ...init, credentials: "omit", mode: "cors" });
  };
  const prototype = scope.XMLHttpRequest?.prototype;
  if (!prototype) return;
  const open = prototype.open;
  const send = prototype.send;
  const rewritten = new WeakSet<XHR>();
  prototype.open = function (method, url, ...args) {
    const target = rewrite(String(url));
    rewritten.delete(this);
    if (target) rewritten.add(this);
    open.call(this, method, target ?? url, ...args);
  };
  prototype.send = function (body) {
    // Clients can assign withCredentials after open().
    if (rewritten.has(this)) this.withCredentials = false;
    send.call(this, body);
  };
}
