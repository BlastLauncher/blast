import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

test("custom element passes fetch-proxy to its session", async () => {
  // Evaluate only the element definition with a session seam; no browser or network needed.
  const source = await readFile(new URL("custom-element.ts", import.meta.url), "utf8");
  const code = new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^import .*;\n/u, "").replace("export function", "function"),
  );
  let definition: { new (): { connectedCallback(): void } } | undefined;
  let options: Record<string, unknown> | undefined;
  const attributes = new Map([
    ["extension", "fixture"],
    ["fetch-proxy", "https://proxy.example/v1"],
  ]);
  class Element {
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    }
    hasAttribute(name: string) {
      return attributes.has(name);
    }
  }
  new Function("HTMLElement", "customElements", "startSession", `${code}; defineBlastExtension();`)(
    Element,
    {
      get: () => undefined,
      define: (_tag: string, constructor: typeof definition) => {
        definition = constructor;
      },
    },
    (_element: unknown, value: Record<string, unknown>) => {
      options = value;
      return { close() {} };
    },
  );
  new definition!().connectedCallback();
  expect(options?.fetchProxy).toBe("https://proxy.example/v1");
});
