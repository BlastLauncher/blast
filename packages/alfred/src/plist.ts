// Property list parser for Alfred `info.plist` files: XML and binary
// (`bplist00`) formats, no dependencies. Inputs come from untrusted archives,
// so both parsers bound depth and reject malformed input with a located error.

export type PlistValue =
  | string
  | number
  | boolean
  | Date
  | Uint8Array
  | PlistValue[]
  | { [key: string]: PlistValue };

type PlistDict = { [key: string]: PlistValue };

const MAX_DEPTH = 512;
const BPLIST_MAGIC = "bplist00";
// Milliseconds from the Unix epoch to Apple's reference date 2001-01-01T00:00:00Z.
const APPLE_EPOCH_MS = 978_307_200_000;

export function parsePlist(input: string | Uint8Array): PlistValue {
  if (typeof input === "string") {
    return parseXmlPlist(input.startsWith("﻿") ? input.slice(1) : input);
  }
  if (input.length >= 6 && asciiAt(input, 0, 6) === "bplist") {
    if (input.length < 8 || asciiAt(input, 0, 8) !== BPLIST_MAGIC) {
      throw new Error(`plist: unsupported binary plist version "${asciiAt(input, 0, 8)}"`);
    }
    return parseBinaryPlist(input);
  }
  // TextDecoder strips a leading UTF-8 BOM by default.
  return parseXmlPlist(new TextDecoder("utf-8").decode(input));
}

// Assigning `__proto__` on a plain object would change its prototype instead
// of storing a key, so that one key is defined as an own property.
function setKey(dict: PlistDict, key: string, value: PlistValue): void {
  if (key === "__proto__") {
    Object.defineProperty(dict, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  } else {
    dict[key] = value;
  }
}

function asciiAt(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < Math.min(end, bytes.length); i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

function toSafeInteger(value: bigint, where: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`plist: integer ${value} ${where} is outside the safe integer range`);
  }
  return Number(value);
}

// ---------------------------------------------------------------------------
// XML

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

class XmlCursor {
  readonly text: string;
  pos = 0;

  constructor(text: string) {
    this.text = text;
  }

  fail(message: string, at = this.pos): never {
    let line = 1;
    let col = 1;
    for (let i = 0; i < at && i < this.text.length; i++) {
      if (this.text[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    throw new Error(`plist: ${message} at line ${line}, column ${col}`);
  }

  startsWith(token: string): boolean {
    return this.text.startsWith(token, this.pos);
  }

  skipUntil(token: string, what: string): void {
    const end = this.text.indexOf(token, this.pos);
    if (end < 0) this.fail(`unterminated ${what}`);
    this.pos = end + token.length;
  }

  // Whitespace, comments, processing instructions and DOCTYPE between elements.
  skipMisc(): void {
    for (;;) {
      while (this.pos < this.text.length && /\s/.test(this.text[this.pos]!)) this.pos++;
      if (this.startsWith("<!--")) {
        this.skipUntil("-->", "comment");
      } else if (this.startsWith("<?")) {
        this.skipUntil("?>", "processing instruction");
      } else if (this.startsWith("<!DOCTYPE")) {
        this.skipDoctype();
      } else {
        return;
      }
    }
  }

  skipDoctype(): void {
    const start = this.pos;
    let inSubset = false;
    let quote = "";
    for (this.pos += "<!DOCTYPE".length; this.pos < this.text.length; this.pos++) {
      const ch = this.text[this.pos]!;
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "[") {
        inSubset = true;
      } else if (ch === "]") {
        inSubset = false;
      } else if (ch === ">" && !inSubset) {
        this.pos++;
        return;
      }
    }
    this.fail("unterminated DOCTYPE", start);
  }

  // Reads `<name attr="...">` or `<name/>`; attributes are ignored.
  readStartTag(): { name: string; selfClosing: boolean; at: number } {
    const at = this.pos;
    if (this.text[this.pos] !== "<" || this.text[this.pos + 1] === "/") {
      this.fail("expected an element");
    }
    const match = /^[A-Za-z_][\w.-]*/.exec(this.text.slice(this.pos + 1, this.pos + 65));
    if (!match) this.fail("invalid element name");
    const name = match[0];
    this.pos += 1 + name.length;
    let quote = "";
    for (; this.pos < this.text.length; this.pos++) {
      const ch = this.text[this.pos]!;
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        const selfClosing = this.text[this.pos - 1] === "/";
        this.pos++;
        return { name, selfClosing, at };
      }
    }
    return this.fail(`unterminated <${name}> tag`, at);
  }

  readEndTag(name: string): void {
    const match = /^<\/([A-Za-z_][\w.-]*)\s*>/.exec(this.text.slice(this.pos, this.pos + 70));
    if (!match) this.fail(`expected </${name}>`);
    if (match[1] !== name) this.fail(`expected </${name}> but found </${match[1]}>`);
    this.pos += match[0].length;
  }

  // Character data up to the closing tag of `name`, decoding entities and CDATA.
  readText(name: string): string {
    let out = "";
    for (;;) {
      const lt = this.text.indexOf("<", this.pos);
      if (lt < 0) this.fail(`unterminated <${name}>`);
      out += this.decodeEntities(this.text.slice(this.pos, lt), this.pos);
      this.pos = lt;
      if (this.startsWith("<![CDATA[")) {
        const end = this.text.indexOf("]]>", this.pos + 9);
        if (end < 0) this.fail("unterminated CDATA section");
        out += this.text.slice(this.pos + 9, end);
        this.pos = end + 3;
      } else if (this.startsWith("<!--")) {
        this.skipUntil("-->", "comment");
      } else if (this.startsWith("</")) {
        this.readEndTag(name);
        return out;
      } else {
        this.fail(`unexpected element inside <${name}>`);
      }
    }
  }

  decodeEntities(raw: string, offset: number): string {
    return raw.replace(/&([^;&\s]*);?/g, (whole, body: string, index: number) => {
      if (!whole.endsWith(";")) this.fail("unterminated entity", offset + index);
      const named = ENTITIES[body];
      if (named !== undefined) return named;
      const numeric = /^#(?:x([0-9A-Fa-f]+)|([0-9]+))$/.exec(body);
      if (!numeric) this.fail(`unknown entity &${body};`, offset + index);
      const code = numeric[1] !== undefined ? parseInt(numeric[1], 16) : parseInt(numeric[2]!, 10);
      if (!(code > 0 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) {
        this.fail(`invalid character reference &${body};`, offset + index);
      }
      return String.fromCodePoint(code);
    });
  }
}

function parseXmlPlist(text: string): PlistValue {
  const cur = new XmlCursor(text);
  cur.skipMisc();
  if (cur.pos >= text.length) cur.fail("empty document");
  const root = cur.readStartTag();
  if (root.name !== "plist") cur.fail(`expected <plist> root but found <${root.name}>`, root.at);
  if (root.selfClosing) cur.fail("<plist> has no value", root.at);
  cur.skipMisc();
  const value = parseXmlValue(cur, 0);
  cur.skipMisc();
  cur.readEndTag("plist");
  // Apple's NSPropertyListSerialization (and plutil) stops at </plist> and
  // ignores trailing bytes; some published Alfred workflows rely on this.
  return value;
}

function parseXmlValue(cur: XmlCursor, depth: number): PlistValue {
  if (depth > MAX_DEPTH) cur.fail(`nesting deeper than ${MAX_DEPTH}`);
  const tag = cur.readStartTag();
  switch (tag.name) {
    case "dict": {
      const dict: PlistDict = {};
      if (tag.selfClosing) return dict;
      for (;;) {
        cur.skipMisc();
        if (cur.startsWith("</")) {
          cur.readEndTag("dict");
          return dict;
        }
        const keyTag = cur.readStartTag();
        if (keyTag.name !== "key")
          cur.fail(`expected <key> in <dict> but found <${keyTag.name}>`, keyTag.at);
        const key = keyTag.selfClosing ? "" : cur.readText("key");
        cur.skipMisc();
        if (cur.startsWith("</")) cur.fail(`missing value for key "${key}"`);
        setKey(dict, key, parseXmlValue(cur, depth + 1));
      }
    }
    case "array": {
      const array: PlistValue[] = [];
      if (tag.selfClosing) return array;
      for (;;) {
        cur.skipMisc();
        if (cur.startsWith("</")) {
          cur.readEndTag("array");
          return array;
        }
        array.push(parseXmlValue(cur, depth + 1));
      }
    }
    case "string":
      return tag.selfClosing ? "" : cur.readText("string");
    case "data": {
      const raw = tag.selfClosing ? "" : cur.readText("data").replace(/\s+/g, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1)
        cur.fail("invalid base64 in <data>", tag.at);
      return new Uint8Array(Buffer.from(raw, "base64"));
    }
    case "true":
    case "false": {
      if (!tag.selfClosing && cur.readText(tag.name).trim() !== "")
        cur.fail(`<${tag.name}> must be empty`, tag.at);
      return tag.name === "true";
    }
    case "integer": {
      const raw = tag.selfClosing ? "" : cur.readText("integer").trim();
      if (/^[+-]?\d+$/.test(raw)) return toSafeInteger(BigInt(raw), `at offset ${tag.at}`);
      if (/^[+-]?0x[0-9A-Fa-f]+$/.test(raw)) {
        const negative = raw.startsWith("-");
        const magnitude = BigInt(raw.replace(/^[+-]/, ""));
        return toSafeInteger(negative ? -magnitude : magnitude, `at offset ${tag.at}`);
      }
      return cur.fail(`invalid <integer> "${raw}"`, tag.at);
    }
    case "real": {
      const raw = tag.selfClosing ? "" : cur.readText("real").trim();
      const lower = raw.toLowerCase();
      if (lower === "nan") return Number.NaN;
      if (lower === "inf" || lower === "+inf" || lower === "infinity")
        return Number.POSITIVE_INFINITY;
      if (lower === "-inf" || lower === "-infinity") return Number.NEGATIVE_INFINITY;
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw))
        cur.fail(`invalid <real> "${raw}"`, tag.at);
      return Number(raw);
    }
    case "date": {
      const raw = tag.selfClosing ? "" : cur.readText("date").trim();
      const date = new Date(raw);
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(raw) ||
        Number.isNaN(date.getTime())
      ) {
        cur.fail(`invalid <date> "${raw}"`, tag.at);
      }
      return date;
    }
    default:
      return cur.fail(`unsupported element <${tag.name}>`, tag.at);
  }
}

// ---------------------------------------------------------------------------
// Binary (bplist00)

const TRAILER_SIZE = 32;
const HEADER_SIZE = 8;

function parseBinaryPlist(bytes: Uint8Array): PlistValue {
  if (bytes.length < HEADER_SIZE + TRAILER_SIZE + 1) {
    throw new Error("plist: binary plist is too short");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const trailer = bytes.length - TRAILER_SIZE;
  const offsetSize = view.getUint8(trailer + 6);
  const refSize = view.getUint8(trailer + 7);
  const numObjects = view.getBigUint64(trailer + 8);
  const topObject = view.getBigUint64(trailer + 16);
  const tableOffset = view.getBigUint64(trailer + 24);

  if (offsetSize < 1 || offsetSize > 8)
    throw new Error(`plist: invalid offset size ${offsetSize} in trailer`);
  if (refSize < 1 || refSize > 8)
    throw new Error(`plist: invalid object reference size ${refSize} in trailer`);
  if (numObjects < 1n) throw new Error("plist: binary plist has no objects");
  if (topObject >= numObjects) throw new Error(`plist: top object ${topObject} is out of range`);
  if (
    tableOffset < BigInt(HEADER_SIZE) ||
    tableOffset + numObjects * BigInt(offsetSize) > BigInt(trailer)
  ) {
    throw new Error("plist: offset table lies outside the file");
  }
  const count = Number(numObjects);
  const table = Number(tableOffset);

  const readUint = (at: number, size: number): number => {
    let value = 0;
    for (let i = 0; i < size; i++) value = value * 256 + bytes[at + i]!;
    return value;
  };

  const objectOffset = (ref: number): number => {
    if (ref >= count)
      throw new Error(`plist: object reference ${ref} is out of range (${count} objects)`);
    const offset = readUint(table + ref * offsetSize, offsetSize);
    if (offset < HEADER_SIZE || offset >= table) {
      throw new Error(`plist: object ${ref} has offset ${offset} outside the object area`);
    }
    return offset;
  };

  const need = (at: number, length: number, what: string): void => {
    if (length < 0 || at + length > table)
      throw new Error(`plist: ${what} at offset ${at} runs past the object area`);
  };

  // Python's plistlib does the same: decoded objects are cached by reference
  // so shared subtrees decode once and a DAG cannot blow up exponentially.
  const decoded = new Map<number, PlistValue>();
  const active = new Set<number>();

  const readLength = (marker: number, at: number): { length: number; start: number } => {
    const low = marker & 0x0f;
    if (low !== 0x0f) return { length: low, start: at + 1 };
    need(at + 1, 1, "length marker");
    const intMarker = bytes[at + 1]!;
    if (intMarker >> 4 !== 0x1)
      throw new Error(
        `plist: invalid length marker 0x${intMarker.toString(16)} at offset ${at + 1}`,
      );
    const size = 1 << (intMarker & 0x0f);
    if (size > 8) throw new Error(`plist: length integer at offset ${at + 1} is too wide`);
    need(at + 2, size, "length integer");
    const length = readUint(at + 2, size);
    if (!Number.isSafeInteger(length))
      throw new Error(`plist: length at offset ${at + 1} is too large`);
    return { length, start: at + 2 + size };
  };

  const readRefs = (start: number, n: number, what: string): number[] => {
    need(start, n * refSize, what);
    const refs: number[] = [];
    for (let i = 0; i < n; i++) refs.push(readUint(start + i * refSize, refSize));
    return refs;
  };

  const readObject = (ref: number, depth: number): PlistValue => {
    const cached = decoded.get(ref);
    if (cached !== undefined) return cached;
    if (active.has(ref)) throw new Error(`plist: object ${ref} contains itself (cycle)`);
    if (depth > MAX_DEPTH) throw new Error(`plist: nesting deeper than ${MAX_DEPTH}`);
    active.add(ref);
    const value = decodeObject(ref, depth);
    active.delete(ref);
    decoded.set(ref, value);
    return value;
  };

  const decodeObject = (ref: number, depth: number): PlistValue => {
    const at = objectOffset(ref);
    const marker = bytes[at]!;
    const kind = marker >> 4;
    const low = marker & 0x0f;
    switch (kind) {
      case 0x0:
        if (marker === 0x08) return false;
        if (marker === 0x09) return true;
        if (marker === 0x00)
          throw new Error(`plist: null object at offset ${at} has no plist value`);
        throw new Error(
          `plist: unsupported marker 0x${marker.toString(16).padStart(2, "0")} at offset ${at}`,
        );
      case 0x1: {
        const size = 1 << low;
        need(at + 1, size, "integer");
        if (size === 1 || size === 2 || size === 4) return readUint(at + 1, size);
        if (size === 8) return toSafeInteger(view.getBigInt64(at + 1), `at offset ${at}`);
        if (size === 16) {
          const value = (view.getBigInt64(at + 1) << 64n) | view.getBigUint64(at + 9);
          return toSafeInteger(value, `at offset ${at}`);
        }
        throw new Error(`plist: unsupported integer width ${size} at offset ${at}`);
      }
      case 0x2: {
        const size = 1 << low;
        need(at + 1, size, "real");
        if (size === 4) return view.getFloat32(at + 1);
        if (size === 8) return view.getFloat64(at + 1);
        throw new Error(`plist: unsupported real width ${size} at offset ${at}`);
      }
      case 0x3: {
        if (marker !== 0x33)
          throw new Error(`plist: invalid date marker 0x${marker.toString(16)} at offset ${at}`);
        need(at + 1, 8, "date");
        return new Date(APPLE_EPOCH_MS + view.getFloat64(at + 1) * 1000);
      }
      case 0x4: {
        const { length, start } = readLength(marker, at);
        need(start, length, "data");
        // Copy, so the value never aliases (or retains) the caller's buffer.
        return new Uint8Array(bytes.subarray(start, start + length));
      }
      case 0x5: {
        const { length, start } = readLength(marker, at);
        need(start, length, "string");
        return asciiAt(bytes, start, start + length);
      }
      case 0x6: {
        const { length, start } = readLength(marker, at);
        need(start, length * 2, "UTF-16 string");
        return new TextDecoder("utf-16be").decode(bytes.subarray(start, start + length * 2));
      }
      case 0x8: {
        const size = low + 1;
        need(at + 1, size, "UID");
        return { CF$UID: readUint(at + 1, size) };
      }
      case 0xa:
      case 0xc: {
        const { length, start } = readLength(marker, at);
        const refs = readRefs(start, length, kind === 0xa ? "array" : "set");
        return refs.map((child) => readObject(child, depth + 1));
      }
      case 0xd: {
        const { length, start } = readLength(marker, at);
        const keys = readRefs(start, length, "dict keys");
        const values = readRefs(start + length * refSize, length, "dict values");
        const dict: PlistDict = {};
        for (let i = 0; i < length; i++) {
          const key = readObject(keys[i]!, depth + 1);
          if (typeof key !== "string")
            throw new Error(`plist: dict key at offset ${at} is not a string`);
          setKey(dict, key, readObject(values[i]!, depth + 1));
        }
        return dict;
      }
      default:
        throw new Error(
          `plist: unsupported marker 0x${marker.toString(16).padStart(2, "0")} at offset ${at}`,
        );
    }
  };

  return readObject(Number(topObject), 0);
}
