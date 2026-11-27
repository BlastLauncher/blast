import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  expandPlaceholders,
  parseAlfredWorkflowEnvelope,
  urlPlaceholderEncoders,
  type PlaceholderContext,
} from "./placeholders.ts";

// Built from local fields so the expected strings hold in every time zone.
const NOW = new Date(2026, 10, 27, 9, 5, 7);

function offsetOf(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const abs = Math.abs(minutes);
  const two = (value: number) => String(value).padStart(2, "0");
  return `${minutes < 0 ? "-" : "+"}${two(Math.floor(abs / 60))}:${two(abs % 60)}`;
}

function context(extra: Partial<PlaceholderContext> = {}): PlaceholderContext {
  const clipboard = ["current", "previous"];
  return {
    query: "hello world",
    variables: { name: "Ada", empty: "" },
    workflow: { name: "Example", bundleId: "com.example", description: "Desc", version: "1.0" },
    supportPath: "/data/com.example",
    uid: "user.workflow.X",
    readClipboard: async (offset) => clipboard[offset],
    now: () => NOW,
    random: () => 0.5,
    uuid: () => "00000000-0000-4000-8000-000000000000",
    ...extra,
  };
}

describe("expandPlaceholders", () => {
  test("expands query, variables and constants", async () => {
    const text = await expandPlaceholders(
      "{query}|{var:name}|{var:missing}|{const:alfred_workflow_name}|{const:alfred_workflow_bundleid}|{const:alfred_workflow_description}|{const:alfred_workflow_version}|{const:alfred_workflow_data}|{const:alfred_workflow_cache}|{const:alfred_workflow_uid}|{const:nope}",
      context(),
    );
    expect(text.split("|")).toEqual([
      "hello world",
      "Ada",
      "",
      "Example",
      "com.example",
      "Desc",
      "1.0",
      "/data/com.example",
      join("/data/com.example", "cache"),
      "user.workflow.X",
      "{const:nope}",
    ]);
  });

  test("joins array queries with tabs", async () => {
    expect(await expandPlaceholders("[{query}]", context({ query: ["a", "b"] }))).toBe("[a\tb]");
  });

  test("reads the clipboard at an offset", async () => {
    expect(await expandPlaceholders("{clipboard}/{clipboard:1}/{clipboard:4}", context())).toBe(
      "current/previous/",
    );
    expect(await expandPlaceholders("<{clipboard}>", context({ readClipboard: undefined }))).toBe(
      "<>",
    );
  });

  test("dates, uuid and random come from the injected hooks", async () => {
    const offset = offsetOf(NOW);
    const text = await expandPlaceholders(
      "{date}|{time}|{datetime}|{isodate}|{isotime}|{uuid}|{random:red, green ,blue}|{random:solo}",
      context(),
    );
    expect(text.split("|")).toEqual([
      "2026-11-27",
      "09:05:07",
      "2026-11-27 09:05:07",
      `2026-11-27T09:05:07${offset}`,
      `09:05:07${offset}`,
      "00000000-0000-4000-8000-000000000000",
      "green",
      "solo",
    ]);
    const draws = [0, 0.999999];
    const edges = await expandPlaceholders(
      "{random:a,b}{random:a,b}",
      context({ random: () => draws.shift()! }),
    );
    expect(edges).toBe("ab");
  });

  test("does not re-scan expanded text", async () => {
    const text = await expandPlaceholders(
      "{var:name}",
      context({ variables: { name: "{query}" } }),
    );
    expect(text).toBe("{query}");
  });

  test("ignoreDynamic keeps dynamic placeholders literal", async () => {
    const text = await expandPlaceholders(
      "{query} {var:name} {const:alfred_workflow_name} {clipboard} {date} {uuid} {random:a,b}",
      context({ ignoreDynamic: true }),
    );
    expect(text).toBe("hello world Ada Example {clipboard} {date} {uuid} {random:a,b}");
  });
});

describe("urlPlaceholderEncoders", () => {
  const url = "https://x.test/?q={query}&n={var:name}";
  const expand = (config: Record<string, string | boolean>, name = "A&B C") =>
    expandPlaceholders(url, {
      query: "a b/c",
      variables: { name },
      encode: urlPlaceholderEncoders(config),
    });

  test("percent-encodes query and variables by default", async () => {
    expect(await expand({})).toBe("https://x.test/?q=a%20b%2Fc&n=A%26B%20C");
  });

  test("replaces encoded spaces when configured", async () => {
    expect(await expand({ spaces: "+" })).toBe("https://x.test/?q=a+b%2Fc&n=A%26B+C");
  });

  test("skipqueryencode and skipvarencode", async () => {
    expect(await expand({ skipqueryencode: true })).toBe("https://x.test/?q=a b/c&n=A%26B%20C");
    expect(await expand({ skipvarencode: true })).toBe("https://x.test/?q=a%20b%2Fc&n=A&B C");
  });
});

describe("parseAlfredWorkflowEnvelope", () => {
  test("reads arg, variables and config", () => {
    expect(
      parseAlfredWorkflowEnvelope(
        '﻿ {"alfredworkflow":{"arg":"x","variables":{"a":"1","b":2,"c":true,"d":null,"e":{"k":1}},"config":{"url":"u"}}}\n',
      ),
    ).toEqual({
      arg: "x",
      variables: { a: "1", b: "2", c: "true", e: '{"k":1}' },
      config: { url: "u" },
    });
  });

  test("keeps array args and omits missing fields", () => {
    expect(parseAlfredWorkflowEnvelope('{"alfredworkflow":{"arg":["a",1,{}]}}')).toEqual({
      arg: ["a", "1"],
    });
    expect(parseAlfredWorkflowEnvelope('{"alfredworkflow":{}}')).toEqual({});
  });

  test("rejects text that is not an envelope", () => {
    for (const text of ["plain", "", "[1]", "{bad json", '{"items":[]}', '{"alfredworkflow":1}']) {
      expect(parseAlfredWorkflowEnvelope(text)).toBeUndefined();
    }
  });
});
