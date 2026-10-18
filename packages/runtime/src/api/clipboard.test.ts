import { afterEach, expect, test } from "bun:test";
import type { JsonValue } from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import { Clipboard } from "./index.ts";

afterEach(() => setCapabilityRequester(undefined));

/** Records every request and answers each one with the next queued value. */
function recorder(answers: JsonValue[]): Array<{ name: string; params: JsonValue }> {
  const requests: Array<{ name: string; params: JsonValue }> = [];
  setCapabilityRequester(async (name, params) => {
    requests.push({ name, params });
    return answers[requests.length - 1] ?? null;
  });
  return requests;
}

// @covers Clipboard.read
// @covers Clipboard.ReadContent
// @covers Clipboard.ReadContent.text
// @covers Clipboard.ReadContent.file
// @covers Clipboard.ReadContent.html
test("Clipboard.read passes the offset and keeps the content the host sent", async () => {
  const content = { text: "from history", file: "/tmp/a.pdf", html: "<b>a</b>" };
  const requests = recorder([content, { text: "" }]);
  expect(await Clipboard.read()).toEqual(content);
  // A host without content answers an empty text; nothing else is invented.
  expect(await Clipboard.read({ offset: 5 })).toEqual({ text: "" });
  expect(requests).toEqual([
    { name: "clipboard.read", params: {} },
    { name: "clipboard.read", params: { offset: 5 } },
  ]);
});

// @covers Clipboard.read
test("Clipboard.read rejects an offset outside 0–5 and a malformed host answer", async () => {
  const requests = recorder([]);
  for (const offset of [-1, 6, 1.5]) {
    await expect(Clipboard.read({ offset })).rejects.toThrow(
      "Clipboard.read: offset must be an integer between 0 and 5",
    );
  }
  // The offset is checked before anything crosses the wire.
  expect(requests).toEqual([]);
  recorder(["not content"]);
  await expect(Clipboard.read()).rejects.toThrow("non-object clipboard content");
});

// @covers Clipboard.readText
test("Clipboard.readText returns the text, undefined when there is none, and the offset", async () => {
  const requests = recorder([{ text: "hello" }, {}, { html: "<b>x</b>" }]);
  expect(await Clipboard.readText()).toBe("hello");
  expect(await Clipboard.readText({ offset: 1 })).toBeUndefined();
  // Content without text is "no text" rather than an invented empty string.
  expect(await Clipboard.readText()).toBeUndefined();
  expect(requests).toEqual([
    { name: "clipboard.read", params: {} },
    { name: "clipboard.read", params: { offset: 1 } },
    { name: "clipboard.read", params: {} },
  ]);
});

// @covers Clipboard.copy
// @covers Clipboard.CopyOptions
// @covers Clipboard.CopyOptions.concealed
// @covers Clipboard.Content
// @covers Clipboard.Content.file
// @covers Clipboard.Content.html
test("Clipboard.copy carries each declared content form and the concealed flag", async () => {
  const requests = recorder([]);
  await Clipboard.copy("plain");
  await Clipboard.copy(42);
  await Clipboard.copy({ text: "structured" });
  await Clipboard.copy({ file: "/tmp/report.pdf" }, { concealed: true });
  await Clipboard.copy({ html: "<b>rich</b>" });
  await Clipboard.copy({ html: "<b>rich</b>", text: "rich" });
  expect(requests).toEqual([
    { name: "clipboard.copy", params: { text: "plain" } },
    { name: "clipboard.copy", params: { text: "42" } },
    { name: "clipboard.copy", params: { text: "structured" } },
    { name: "clipboard.copy", params: { file: "/tmp/report.pdf", concealed: true } },
    { name: "clipboard.copy", params: { html: "<b>rich</b>" } },
    { name: "clipboard.copy", params: { html: "<b>rich</b>", text: "rich" } },
  ]);
});

// @covers Clipboard.copy
// @covers Clipboard.Content
test("Clipboard.copy rejects content outside the declared union before the wire", async () => {
  const requests = recorder([]);
  await expect(Clipboard.copy({} as { text: string })).rejects.toThrow(
    "Clipboard.copy: unsupported content in Blast",
  );
  await expect(Clipboard.copy({ file: 5 } as unknown as { file: string })).rejects.toThrow(
    "unsupported content in Blast",
  );
  expect(requests).toEqual([]);
});

// @covers Clipboard.paste
// @covers Clipboard.Content
// @covers Clipboard.Content.text
// @covers Clipboard.Content.file
// @covers Clipboard.Content.html
test("Clipboard.paste sends text, file and HTML content", async () => {
  const requests = recorder([]);
  for (const [content, params] of [
    ["plain", { text: "plain" }],
    [42, { text: "42" }],
    [{ text: "structured" }, { text: "structured" }],
    [{ file: "/tmp/a.pdf" }, { file: "/tmp/a.pdf" }],
    [{ html: "<b>rich</b>" }, { html: "<b>rich</b>" }],
    [{ html: "<b>rich</b>", text: "rich" }, { html: "<b>rich</b>", text: "rich" }],
  ] as const) {
    await Clipboard.paste(content);
    expect(requests.at(-1)).toEqual({ name: "clipboard.paste", params });
  }
  await expect(Clipboard.paste({} as { text: string })).rejects.toThrow(
    "Clipboard.paste: unsupported content in Blast",
  );
  expect(requests).toHaveLength(6);
});

// @covers Clipboard.clear
test("Clipboard.clear requests an empty clipboard", async () => {
  const requests = recorder([]);
  await Clipboard.clear();
  expect(requests).toEqual([{ name: "clipboard.clear", params: {} }]);
});

// @covers Clipboard.read
// @covers Clipboard.paste
// @covers Clipboard.clear
test("the clipboard capabilities reject when the host denies them", async () => {
  setCapabilityRequester(() => Promise.reject(new Error("Capability denied")));
  await expect(Clipboard.read()).rejects.toThrow("Capability denied");
  await expect(Clipboard.readText()).rejects.toThrow("Capability denied");
  await expect(Clipboard.paste("x")).rejects.toThrow("Capability denied");
  await expect(Clipboard.clear()).rejects.toThrow("Capability denied");
});
