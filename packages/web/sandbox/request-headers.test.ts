import { expect, test } from "bun:test";
import { dropForbiddenRequestHeaders, isForbiddenRequestHeader } from "./request-headers.ts";

test("forbidden request headers follow the Fetch spec list, prefixes and User-Agent", () => {
  for (const name of [
    "User-Agent",
    "host",
    " Content-Length ",
    "Proxy-Authorization",
    "Sec-Fetch-Mode",
  ])
    expect(isForbiddenRequestHeader(name)).toBe(true);
  for (const name of ["Authorization", "Content-Type", "Accept", "X-Api-Key"])
    expect(isForbiddenRequestHeader(name)).toBe(false);
});

test("XHR skips forbidden headers instead of refusing them, once per prototype", () => {
  const sent: string[] = [];
  class FakeXhr {
    setRequestHeader(name: string, value: string) {
      sent.push(`${name}: ${value}`);
    }
  }
  dropForbiddenRequestHeaders(FakeXhr.prototype);
  dropForbiddenRequestHeaders(FakeXhr.prototype);
  const request = new FakeXhr();
  request.setRequestHeader("User-Agent", "splatoon");
  request.setRequestHeader("Authorization", "Bearer x");
  request.setRequestHeader("Content-Type", "application/json");
  expect(sent).toEqual(["Authorization: Bearer x", "Content-Type: application/json"]);
  expect(() => dropForbiddenRequestHeaders(undefined)).not.toThrow();
});
