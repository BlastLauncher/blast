import { describe, expect, test } from "bun:test";
import { cnameForOrigin, extractStats, parseOrigin } from "./site.ts";

describe("site build helpers", () => {
  test("validates origins and rejects paths", () => {
    expect(parseOrigin("https://example.com/").origin).toBe("https://example.com");
    expect(() => parseOrigin("ftp://example.com")).toThrow();
    expect(() => parseOrigin("https://example.com/demo")).toThrow();
  });
  test("only custom domains get CNAME files", () => {
    expect(cnameForOrigin("http://127.0.0.1:4173")).toBeUndefined();
    expect(cnameForOrigin("https://blastlauncher.github.io/")).toBeUndefined();
    expect(cnameForOrigin("https://blast.example.com/")).toBe("blast.example.com");
  });
  test("extracts generated coverage and sweep numbers", () => {
    const stats = extractStats(
      "**Non-deprecated coverage: 12/15 covered (80.0%), 2 partial, 1 missing.**",
      "Corpus commit `x`; seed `y`; 42 selected extensions and 90 commands (90 command records).\n- rendered: 77 command(s)",
    );
    expect(stats).toEqual({
      coverage: { covered: 12, total: 15, percent: "80.0%" },
      rendered: 77,
      commands: 90,
    });
  });
});
