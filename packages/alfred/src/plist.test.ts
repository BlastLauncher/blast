import { describe, expect, test } from "bun:test";
import { parsePlist, type PlistValue } from "./plist.ts";

const HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n';

function xml(body: string): string {
  return `${HEADER}<plist version="1.0">\n${body}\n</plist>\n`;
}

describe("XML plist", () => {
  test("parses every value type", () => {
    const value = parsePlist(
      xml(`<dict>
  <key>string</key><string>hello</string>
  <key>integer</key><integer>-42</integer>
  <key>hex</key><integer>0x1F</integer>
  <key>real</key><real>3.5e2</real>
  <key>nan</key><real>nan</real>
  <key>yes</key><true/>
  <key>no</key><false/>
  <key>date</key><date>2024-02-29T12:34:56Z</date>
  <key>data</key><data>
    aGVs
    bG8=
  </data>
  <key>array</key><array><integer>1</integer><string>two</string><dict><key>k</key><real>.5</real></dict></array>
</dict>`),
    ) as Record<string, PlistValue>;
    expect(value.string).toBe("hello");
    expect(value.integer).toBe(-42);
    expect(value.hex).toBe(31);
    expect(value.real).toBe(350);
    expect(Number.isNaN(value.nan)).toBe(true);
    expect(value.yes).toBe(true);
    expect(value.no).toBe(false);
    expect(value.date).toEqual(new Date("2024-02-29T12:34:56Z"));
    expect(value.data).toEqual(new TextEncoder().encode("hello"));
    expect(value.array).toEqual([1, "two", { k: 0.5 }]);
  });

  test("decodes named, decimal and hex entities including astral code points", () => {
    const value = parsePlist(
      xml("<string>&amp;&lt;&gt;&quot;&apos; &#65;&#x42; &#128512;&#x1F680;</string>"),
    );
    expect(value).toBe(`&<>"' AB \u{1F600}\u{1F680}`);
  });

  test("handles CDATA, comments, DOCTYPE with internal subset and self-closing tags", () => {
    const value = parsePlist(`<?xml version="1.0"?>
<!-- leading comment -->
<!DOCTYPE plist [ <!ENTITY x "y"> ]>
<plist version="1.0"><dict>
  <!-- between keys -->
  <key>script</key><string><![CDATA[echo "<a & b>"]]> &amp; <!-- inline --> more</string>
  <key/><string/>
  <key>emptyDict</key><dict/>
  <key>emptyArray</key><array/>
  <key>emptyData</key><data/>
  <key>emptyDict2</key><dict></dict>
</dict></plist>`);
    expect(value).toEqual({
      script: 'echo "<a & b>" &  more',
      "": "",
      emptyDict: {},
      emptyArray: [],
      emptyData: new Uint8Array(0),
      emptyDict2: {},
    });
  });

  test("parses a realistic Alfred info.plist from bytes with a BOM", () => {
    const text = xml(`<dict>
	<key>bundleid</key>
	<string>com.example.search</string>
	<key>connections</key>
	<dict>
		<key>A1B2</key>
		<array>
			<dict>
				<key>destinationuid</key>
				<string>C3D4</string>
				<key>modifiers</key>
				<integer>0</integer>
				<key>vitoclose</key>
				<false/>
			</dict>
		</array>
	</dict>
	<key>objects</key>
	<array>
		<dict>
			<key>config</key>
			<dict>
				<key>keyword</key>
				<string>gh</string>
				<key>script</key>
				<string>python3 search.py "{query}" &gt; /dev/null</string>
				<key>type</key>
				<integer>0</integer>
			</dict>
			<key>type</key>
			<string>alfred.workflow.input.scriptfilter</string>
			<key>uid</key>
			<string>A1B2</string>
			<key>version</key>
			<integer>3</integer>
		</dict>
	</array>
	<key>userconfigurationconfig</key>
	<array>
		<dict>
			<key>config</key>
			<dict><key>default</key><string></string><key>required</key><true/></dict>
			<key>type</key><string>textfield</string>
			<key>variable</key><string>API_TOKEN</string>
		</dict>
	</array>
	<key>version</key>
	<string>1.2.0</string>
</dict>`);
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
    const value = parsePlist(bytes) as Record<string, PlistValue>;
    expect(value.bundleid).toBe("com.example.search");
    expect(value.connections).toEqual({
      A1B2: [{ destinationuid: "C3D4", modifiers: 0, vitoclose: false }],
    });
    const objects = value.objects as Array<Record<string, PlistValue>>;
    expect(objects[0]!.type).toBe("alfred.workflow.input.scriptfilter");
    expect((objects[0]!.config as Record<string, PlistValue>).script).toBe(
      'python3 search.py "{query}" > /dev/null',
    );
    expect(value.userconfigurationconfig).toEqual([
      { config: { default: "", required: true }, type: "textfield", variable: "API_TOKEN" },
    ]);
    expect(parsePlist(`﻿${xml("<string>x</string>")}`)).toBe("x");
  });

  test("stores __proto__ as an own key without touching the prototype", () => {
    const value = parsePlist(
      xml("<dict><key>__proto__</key><dict><key>polluted</key><true/></dict></dict>"),
    ) as Record<string, PlistValue>;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.keys(value)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test.each([
    ["unknown entity", xml("<string>&nbsp;</string>"), /unknown entity &nbsp;/],
    ["bare ampersand", xml("<string>a & b</string>"), /unterminated entity/],
    ["surrogate reference", xml("<string>&#xD800;</string>"), /invalid character reference/],
    [
      "mismatched end tag",
      xml("<array><string>a</array>"),
      /expected <\/string> but found <\/array>/,
    ],
    ["missing dict value", xml("<dict><key>a</key></dict>"), /missing value for key "a"/],
    ["non-key in dict", xml("<dict><string>a</string></dict>"), /expected <key>/],
    ["invalid integer", xml("<integer>1.5</integer>"), /invalid <integer>/],
    ["unsafe integer", xml("<integer>9007199254740993</integer>"), /safe integer range/],
    ["invalid date", xml("<date>yesterday</date>"), /invalid <date>/],
    ["invalid base64", xml("<data>!!!</data>"), /invalid base64/],
    ["unknown element", xml("<null/>"), /unsupported element <null>/],
    ["wrong root", "<dict></dict>", /expected <plist> root/],
    ["trailing content", `${xml("<true/>")}<true/>`, /unexpected content after <\/plist>/],
    ["unterminated comment", xml("<!-- <true/>"), /unterminated comment/],
    ["empty document", "   ", /empty document/],
  ])("rejects %s", (_name, input, message) => {
    expect(() => parsePlist(input)).toThrow(message);
  });

  test("reports the line of an error", () => {
    expect(() => parsePlist("<plist>\n<dict>\n<key>a</key>\n<bogus/>\n</dict></plist>")).toThrow(
      /line 4, column 1/,
    );
  });

  test("rejects nesting beyond the depth limit", () => {
    expect(() => parsePlist(xml(`${"<array>".repeat(600)}${"</array>".repeat(600)}`))).toThrow(
      /nesting deeper/,
    );
  });
});

// Minimal bplist00 writer for fixtures: objects are pre-encoded byte arrays
// whose references are single bytes (refSize 1).
function bplist(
  objects: number[][],
  top = 0,
  overrides: { refSize?: number; numObjects?: number } = {},
): Uint8Array {
  const out: number[] = [..."bplist00"].map((c) => c.charCodeAt(0));
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(out.length);
    out.push(...object);
  }
  const tableOffset = out.length;
  const offsetSize = tableOffset < 256 ? 1 : 2;
  for (const offset of offsets) {
    if (offsetSize === 2) out.push(offset >> 8);
    out.push(offset & 0xff);
  }
  const trailer = new DataView(new ArrayBuffer(32));
  trailer.setUint8(6, offsetSize);
  trailer.setUint8(7, overrides.refSize ?? 1);
  trailer.setBigUint64(8, BigInt(overrides.numObjects ?? objects.length));
  trailer.setBigUint64(16, BigInt(top));
  trailer.setBigUint64(24, BigInt(tableOffset));
  return new Uint8Array([...out, ...new Uint8Array(trailer.buffer)]);
}

const ascii = (s: string): number[] => [
  ...(s.length < 15 ? [0x50 | s.length] : [0x5f, 0x10, s.length]),
  ...[...s].map((c) => c.charCodeAt(0)),
];
const utf16 = (s: string): number[] => {
  const units: number[] = [];
  for (let i = 0; i < s.length; i++) units.push(s.charCodeAt(i) >> 8, s.charCodeAt(i) & 0xff);
  return [0x60 | (units.length / 2), ...units];
};
const be = (bytes: number, write: (view: DataView) => void): number[] => {
  const view = new DataView(new ArrayBuffer(bytes));
  write(view);
  return [...new Uint8Array(view.buffer)];
};

describe("binary plist", () => {
  test("decodes every marker type in nested containers", () => {
    const keys = [
      "f",
      "t",
      "i1",
      "i2",
      "i4",
      "i8",
      "r4",
      "r8",
      "date",
      "data",
      "ascii",
      "long",
      "utf16",
      "uid",
      "set",
    ];
    const values: number[][] = [
      [0x08],
      [0x09],
      [0x10, 0xff],
      [0x11, 0x01, 0x00],
      [0x12, ...be(4, (v) => v.setUint32(0, 0xfffffffe))],
      [0x13, ...be(8, (v) => v.setBigInt64(0, -5n))],
      [0x22, ...be(4, (v) => v.setFloat32(0, 1.5))],
      [0x23, ...be(8, (v) => v.setFloat64(0, -0.25))],
      [0x33, ...be(8, (v) => v.setFloat64(0, 86_400.5))],
      [0x43, 1, 2, 3],
      ascii("plain"),
      ascii("a string longer than fifteen"),
      utf16("café \u{1F600}"),
      [0x80, 0x07],
      [0xc2, 0x02, 0x03], // set referencing objects 2 (true) and 3 (255)
    ];
    // Layout: 0 = root dict, 1..15 = values, 16..30 = keys. Fifteen entries
    // need the extended length form (low nibble 0xF + an int object).
    const n = keys.length;
    const root = [0xdf, 0x10, n, ...keys.map((_, i) => 1 + n + i), ...values.map((_, i) => 1 + i)];
    const value = parsePlist(bplist([root, ...values, ...keys.map(ascii)]));
    expect(value).toEqual({
      f: false,
      t: true,
      i1: 255,
      i2: 256,
      i4: 0xfffffffe,
      i8: -5,
      r4: 1.5,
      r8: -0.25,
      date: new Date("2001-01-02T00:00:00.500Z"),
      data: new Uint8Array([1, 2, 3]),
      ascii: "plain",
      long: "a string longer than fifteen",
      utf16: "café \u{1F600}",
      uid: { CF$UID: 7 },
      set: [true, 255],
    });
  });

  test("decodes 16-byte integers, negative dates and nested arrays", () => {
    const value = parsePlist(
      bplist([
        [0xa3, 1, 2, 3],
        [0x14, ...be(16, (v) => v.setBigInt64(8, 1n << 40n))],
        [0x33, ...be(8, (v) => v.setFloat64(0, -978_307_200))],
        [0xa1, 4],
        [0xa0],
      ]),
    );
    expect(value).toEqual([2 ** 40, new Date(0), [[]]]);
  });

  test("decodes a shared subtree once instead of expanding it", () => {
    // Each array references the previous one twice: 2^60 leaves if expanded.
    const objects: number[][] = [[0x09]];
    for (let i = 1; i <= 60; i++) objects.push([0xa2, i - 1, i - 1]);
    const value = parsePlist(bplist(objects, 60)) as PlistValue[];
    expect(value).toHaveLength(2);
  });

  test.each([
    [
      "an unsupported version",
      new TextEncoder().encode("bplist01" + "x".repeat(40)),
      /unsupported binary plist version/,
    ],
    ["a truncated file", new TextEncoder().encode("bplist00"), /too short/],
    ["a bad reference size", bplist([[0x09]], 0, { refSize: 0 }), /invalid object reference size/],
    ["a top object out of range", bplist([[0x09]], 3), /top object 3 is out of range/],
    [
      "an offset table past the trailer",
      bplist([[0x09]], 0, { numObjects: 50 }),
      /offset table lies outside/,
    ],
    ["a reference out of range", bplist([[0xa1, 9]]), /object reference 9 is out of range/],
    ["a cycle", bplist([[0xa1, 0]]), /contains itself/],
    ["an indirect cycle", bplist([[0xa1, 1], [0xd1, 2, 0], ascii("k")]), /contains itself/],
    [
      "a non-string dict key",
      bplist([
        [0xd1, 1, 1],
        [0x10, 1],
      ]),
      /dict key .* is not a string/,
    ],
    ["a null object", bplist([[0x00]]), /null object/],
    ["an unknown marker", bplist([[0x70]]), /unsupported marker 0x70/],
    ["a string past the object area", bplist([[0x5e, 0x41]]), /runs past the object area/],
    ["an invalid real width", bplist([[0x21, 0, 0]]), /unsupported real width/],
    [
      "an unsafe 8-byte integer",
      bplist([[0x13, ...be(8, (v) => v.setBigInt64(0, 1n << 60n))]]),
      /safe integer range/,
    ],
  ])("rejects %s", (_name, input, message) => {
    expect(() => parsePlist(input)).toThrow(message);
  });

  test("rejects nesting beyond the depth limit", () => {
    // refSize 1 cannot address 600 objects, so the chain uses 2-byte references.
    const chain: number[][] = [[0xa0]];
    for (let i = 1; i <= 600; i++) chain.push([0xa1, (i - 1) >> 8, (i - 1) & 0xff]);
    expect(() => parsePlist(bplist(chain, 600, { refSize: 2 }))).toThrow(/nesting deeper/);
  });
});
