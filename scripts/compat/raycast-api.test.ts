import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { parseIntegrity, selectRelease, sha256Hex, verifyIntegrity } from "./raycast-api.ts";

function digest(algorithm: string, input: Uint8Array): string {
  return createHash(algorithm).update(input).digest("base64");
}

const METADATA: unknown = {
  "dist-tags": { latest: "2.8.2", "latest-v0": "0.71.7" },
  versions: {
    "2.8.2": {
      license: "MIT",
      dist: { tarball: "https://example.test/api-2.8.2.tgz", integrity: "sha512-two" },
    },
    "2.8.1": {
      license: "MIT",
      dist: { tarball: "https://example.test/api-2.8.1.tgz", integrity: "sha512-one" },
    },
  },
};

describe("selectRelease", () => {
  test("defaults to dist-tags.latest", () => {
    expect(selectRelease(METADATA)).toEqual({
      version: "2.8.2",
      license: "MIT",
      tarball: "https://example.test/api-2.8.2.tgz",
      integrity: "sha512-two",
    });
  });

  test("honours an explicitly requested version", () => {
    expect(selectRelease(METADATA, "2.8.1").version).toBe("2.8.1");
    expect(selectRelease(METADATA, "2.8.1").tarball).toBe("https://example.test/api-2.8.1.tgz");
  });

  test("rejects an unknown version", () => {
    expect(() => selectRelease(METADATA, "9.9.9")).toThrow("unknown @raycast/api version: 9.9.9");
  });

  test("rejects metadata without a latest tag", () => {
    expect(() => selectRelease({ versions: {} })).toThrow("missing dist-tags.latest");
  });

  test("rejects a release without dist metadata", () => {
    expect(() =>
      selectRelease({ "dist-tags": { latest: "1.0.0" }, versions: { "1.0.0": {} } }),
    ).toThrow("@raycast/api@1.0.0: missing dist");
  });

  test("rejects non-object metadata", () => {
    expect(() => selectRelease("nope")).toThrow("registry metadata is not an object");
  });
});

describe("parseIntegrity", () => {
  test("splits space separated digests", () => {
    expect(parseIntegrity("sha512-abc sha256-def")).toEqual([
      { algorithm: "sha512", digest: "abc" },
      { algorithm: "sha256", digest: "def" },
    ]);
  });

  test("rejects unsupported algorithms", () => {
    expect(() => parseIntegrity("md5-abc")).toThrow("unsupported integrity digest: md5-abc");
  });
});

describe("verifyIntegrity", () => {
  const bytes = new TextEncoder().encode("vendor me\n");

  test("accepts a matching sha512 digest", () => {
    expect(() => verifyIntegrity(bytes, `sha512-${digest("sha512", bytes)}`)).not.toThrow();
  });

  test("rejects a mismatched digest", () => {
    expect(() => verifyIntegrity(bytes, `sha512-${digest("sha512", new Uint8Array())}`)).toThrow(
      /^integrity mismatch: registry says sha512-/,
    );
  });

  test("accepts when any of several digests matches", () => {
    const integrity = `sha256-${digest("sha256", new Uint8Array())} sha512-${digest("sha512", bytes)}`;
    expect(() => verifyIntegrity(bytes, integrity)).not.toThrow();
  });
});

describe("sha256Hex", () => {
  test("matches the known digest of abc", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("changes when a single byte changes", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).not.toBe(
      sha256Hex(new TextEncoder().encode("abd")),
    );
  });
});
