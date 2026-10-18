import { afterEach, expect, test } from "bun:test";
import type { JsonValue } from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import { open } from "./index.ts";

afterEach(() => setCapabilityRequester(undefined));

function records(): Array<[string, JsonValue]> {
  const requests: Array<[string, JsonValue]> = [];
  setCapabilityRequester(async (name, params) => {
    requests.push([name, params]);
    return null;
  });
  return requests;
}

// @covers open
test("open requests open.url for URLs and open.path for files, passing the application along", async () => {
  const requests = records();
  await open("https://example.com/docs");
  await open("mailto:hi@example.com");
  await open("https://example.com/docs", "com.google.Chrome");
  await open("/tmp/report.pdf");
  await open("/tmp/report.pdf", { name: "TextEdit", path: "/Applications/TextEdit.app" });
  await open("file:///tmp/report.pdf");
  await open("/tmp/report.pdf", {
    name: "TextEdit",
    path: "/Applications/TextEdit.app",
    bundleId: "com.apple.TextEdit",
    localizedName: "TextEdit",
  });
  expect(requests).toEqual([
    ["open.url", { url: "https://example.com/docs" }],
    ["open.url", { url: "mailto:hi@example.com" }],
    ["open.url", { url: "https://example.com/docs", application: "com.google.Chrome" }],
    ["open.path", { path: "/tmp/report.pdf" }],
    [
      "open.path",
      {
        path: "/tmp/report.pdf",
        application: { name: "TextEdit", path: "/Applications/TextEdit.app" },
      },
    ],
    ["open.path", { path: "file:///tmp/report.pdf" }],
    [
      "open.path",
      {
        path: "/tmp/report.pdf",
        application: {
          name: "TextEdit",
          path: "/Applications/TextEdit.app",
          bundleId: "com.apple.TextEdit",
        },
      },
    ],
  ]);
});

// @covers open
test("open is denied by default and rejects an empty target", async () => {
  setCapabilityRequester(() => Promise.reject(new Error("Capability denied: open.url")));
  await expect(open("https://example.com")).rejects.toThrow("Capability denied: open.url");
  const requests = records();
  await expect(open("")).rejects.toThrow("target must be a non-empty string");
  expect(requests).toEqual([]);
});
