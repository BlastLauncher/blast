// Node lets a request set any header; a browser forbids some (the Fetch
// spec's forbidden request-header names, plus `User-Agent`, which Chromium
// still refuses on XMLHttpRequest). `fetch` drops them quietly, but XHR logs
// "Refused to set unsafe header" for each. Extensions whose fetch polyfill
// (cross-fetch's browser build) uses XHR would report an error for a request
// that works, so the sandbox drops these headers as `fetch` does.

const forbidden = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "user-agent",
  "via",
]);

export function isForbiddenRequestHeader(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return forbidden.has(lower) || lower.startsWith("proxy-") || lower.startsWith("sec-");
}

type HeaderSetter = { setRequestHeader(name: string, value: string): void };
const guarded = Symbol.for("blast.requestHeadersGuarded");

/**
 * Makes `setRequestHeader` skip forbidden names on `prototype`
 * (XMLHttpRequest's). Idempotent: a sandbox may evaluate the runtime twice.
 */
export function dropForbiddenRequestHeaders(prototype: HeaderSetter | undefined): void {
  if (!prototype || (prototype as Record<symbol, unknown>)[guarded]) return;
  const set = prototype.setRequestHeader;
  prototype.setRequestHeader = function (this: HeaderSetter, name: string, value: string) {
    if (isForbiddenRequestHeader(String(name))) return;
    set.call(this, name, value);
  };
  Object.defineProperty(prototype, guarded, { value: true });
}
