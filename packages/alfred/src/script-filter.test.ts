import { describe, expect, test } from "bun:test";
import { parseScriptFilterOutput } from "./script-filter.ts";

describe("parseScriptFilterOutput JSON", () => {
  test("parses items with every documented field", () => {
    const output = parseScriptFilterOutput(
      JSON.stringify({
        variables: { mode: "search", count: 3, on: true, nested: { a: 1 }, gone: null },
        rerun: 0.5,
        cache: { seconds: 120, loosereload: true },
        skipknowledge: true,
        items: [
          {
            uid: "desktop",
            type: "file",
            title: "Desktop",
            subtitle: "~/Desktop",
            arg: ["~/Desktop", "~/Downloads", 3],
            autocomplete: "Desktop",
            match: "desk top",
            icon: { type: "fileicon", path: "~/Desktop" },
            mods: {
              "shift+cmd": { valid: false, subtitle: "Reveal", arg: "reveal" },
              Option: { arg: "alt", icon: { path: "alt.png" }, variables: { m: "alt" } },
              hyper: { arg: "ignored" },
            },
            text: { copy: "copied", largetext: "LARGE" },
            quicklookurl: "https://example.com",
            variables: { item: "1" },
            action: { text: "hello", url: ["https://a", "https://b"] },
          },
          { title: "Minimal", valid: false, type: "nonsense", icon: { type: "filetype" } },
          { title: 42, arg: "x", type: "file:skipcheck", action: "act" },
        ],
      }),
    );
    expect(output).toEqual({
      variables: { mode: "search", count: "3", on: "true", nested: '{"a":1}' },
      rerun: 0.5,
      cache: { seconds: 120, loosereload: true },
      skipknowledge: true,
      items: [
        {
          uid: "desktop",
          title: "Desktop",
          subtitle: "~/Desktop",
          arg: ["~/Desktop", "~/Downloads", "3"],
          valid: true,
          autocomplete: "Desktop",
          match: "desk top",
          type: "file",
          icon: { type: "fileicon", path: "~/Desktop" },
          mods: {
            "cmd+shift": { valid: false, subtitle: "Reveal", arg: "reveal" },
            alt: { arg: "alt", icon: { path: "alt.png" }, variables: { m: "alt" } },
          },
          text: { copy: "copied", largetext: "LARGE" },
          quicklookurl: "https://example.com",
          variables: { item: "1" },
          action: { text: "hello", url: ["https://a", "https://b"] },
        },
        { title: "Minimal", valid: false, type: "default" },
        { title: "42", arg: "x", valid: true, type: "file:skipcheck", action: "act" },
      ],
    });
  });

  test("clamps rerun and cache seconds and drops non-numeric values", () => {
    expect(parseScriptFilterOutput('{"items":[],"rerun":0.01,"cache":{"seconds":1}}')).toEqual({
      items: [],
      rerun: 0.1,
      cache: { seconds: 5 },
    });
    expect(parseScriptFilterOutput('{"items":[],"rerun":60,"cache":{"seconds":999999}}')).toEqual({
      items: [],
      rerun: 5,
      cache: { seconds: 86400 },
    });
    expect(parseScriptFilterOutput('{"rerun":"1","cache":{"seconds":"10"}}')).toEqual({
      items: [],
    });
  });

  test("returns no items for empty output", () => {
    expect(parseScriptFilterOutput("")).toEqual({ items: [] });
    expect(parseScriptFilterOutput("  \n\t ")).toEqual({ items: [] });
  });

  test("rejects invalid payloads with a named error", () => {
    expect(() => parseScriptFilterOutput("{items:")).toThrow(
      "script filter: output is not valid JSON",
    );
    expect(() => parseScriptFilterOutput("[1,2]")).toThrow("JSON output must be an object");
    expect(() => parseScriptFilterOutput('{"items":{}}')).toThrow("`items` must be an array");
    expect(() => parseScriptFilterOutput('{"items":["x"]}')).toThrow("item 1 must be an object");
  });
});

describe("parseScriptFilterOutput legacy XML", () => {
  test("parses attributes, child elements, modifiers, CDATA and entities", () => {
    const output = parseScriptFilterOutput(`<?xml version="1.0" encoding="utf-8"?>
<!-- results -->
<items>
  <item uid="desktop" arg="~/Desktop" valid="YES" autocomplete="Desk&amp;top" type="file">
    <title>Desktop &lt;home&gt; &#x1F600;</title>
    <subtitle>~/Desktop</subtitle>
    <subtitle mod="shift">Shift subtitle</subtitle>
    <subtitle mod="cmd+option">Cmd-alt subtitle</subtitle>
    <icon type="fileicon">~/Desktop</icon>
    <text type="copy">copy &quot;me&quot;</text>
    <text type="largetype"><![CDATA[<big> & bold]]></text>
    <quicklookurl>https://example.com/?a=1&amp;b=2</quicklookurl>
    <mod key="cmd" subtitle="Reveal" arg="reveal" valid="no"/>
    <mod key="unknown" subtitle="ignored"/>
  </item>
  <item valid="no">
    <title><![CDATA[Raw & <unescaped>]]></title>
    <arg>child arg</arg>
    <icon>icon.png</icon>
    <text type="largetext">big</text>
  </item>
  <item><title>Stray &amp unchanged &bogus;</title></item>
</items>
`);
    expect(output).toEqual({
      items: [
        {
          uid: "desktop",
          title: "Desktop <home> 😀",
          subtitle: "~/Desktop",
          arg: "~/Desktop",
          valid: true,
          autocomplete: "Desk&top",
          type: "file",
          icon: { type: "fileicon", path: "~/Desktop" },
          mods: {
            shift: { subtitle: "Shift subtitle" },
            "cmd+alt": { subtitle: "Cmd-alt subtitle" },
            cmd: { subtitle: "Reveal", arg: "reveal", valid: false },
          },
          text: { copy: 'copy "me"', largetext: "<big> & bold" },
          quicklookurl: "https://example.com/?a=1&b=2",
        },
        {
          title: "Raw & <unescaped>",
          arg: "child arg",
          valid: false,
          type: "default",
          icon: { path: "icon.png" },
          text: { largetext: "big" },
        },
        { title: "Stray &amp unchanged &bogus;", valid: true, type: "default" },
      ],
    });
  });

  test("rejects malformed XML and unexpected roots", () => {
    expect(() => parseScriptFilterOutput("<items><item><title>x</item></items>")).toThrow(
      "script filter: invalid XML output: expected </title>",
    );
    expect(() => parseScriptFilterOutput("<items><item>")).toThrow("unterminated <item>");
    expect(() => parseScriptFilterOutput("<items></items><extra/>")).toThrow(
      "unexpected content after </items>",
    );
    expect(() => parseScriptFilterOutput("<results></results>")).toThrow(
      "expected <items> root, found <results>",
    );
    expect(() => parseScriptFilterOutput('<items><item uid="a></items>')).toThrow(
      "malformed <item> tag",
    );
  });
});
