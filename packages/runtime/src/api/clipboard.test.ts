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

// @covers Clipboard.paste partial
// @covers Clipboard.Content partial
// @covers Clipboard.Content.text
test("Clipboard.paste sends text for string, number and { text } content", async () => {
  const requests = recorder([]);
  for (const [content, text] of [
    ["plain", "plain"],
    [42, "42"],
    [{ text: "structured" }, "structured"],
  ] as const) {
    await Clipboard.paste(content);
    expect(requests.at(-1)).toEqual({ name: "clipboard.paste", params: { text } });
  }
  for (const content of [{ file: "/tmp/a.pdf" }, { html: "<b>rich</b>" }]) {
    await expect(Clipboard.paste(content)).rejects.toThrow(
      "Clipboard.paste: unsupported content in Blast",
    );
  }
  expect(requests).toHaveLength(3);
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
