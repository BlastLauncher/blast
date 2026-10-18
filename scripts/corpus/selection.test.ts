// Offline tests for the curated-set selection rules. Fixture manifests and
// sources only: `bun test` must never read the corpus checkout or the network.
import { expect, test } from "bun:test";
import { parsePin } from "./corpus.ts";
import {
  analyzeSources,
  capacity,
  DEFAULT_QUOTAS,
  eligible,
  exclusionIds,
  KEPT_CURATED,
  manifestRejections,
  offlineQuotasMet,
  rank,
  ranked,
  renderPin,
  selectCurated,
  SELECTION_CRITERIA,
  strataMembers,
  stratumOf,
  unprovidedDependencies,
  usesNetwork,
  UTILS_HOOKS,
  viewCommands,
  type Candidate,
  type Quotas,
} from "./selection.ts";
import type { Source } from "./usage.ts";

const source = (text: string, file = "src/index.tsx"): Source => ({ file, source: text });

const LIST_SOURCE = `import { List } from "@raycast/api";
export default function Command() {
  return <List><List.Item title="one" /></List>;
}
`;

const FORM_SOURCE = `import { Action, ActionPanel, Form } from "@raycast/api";
export default function Command() {
  return <Form onSubmit={() => {}}><Form.TextField id="name" title="Name" /><ActionPanel><Action.SubmitForm /></ActionPanel></Form>;
}
`;

const DETAIL_SOURCE = `import { Detail } from "@raycast/api";
export default function Command() {
  return <Detail markdown="# title" metadata={<Detail.Metadata />} />;
}
`;

const UTILS_SOURCE = `import { List } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
export default function Command() {
  const [value] = useCachedState("key", 1);
  return <List><List.Item title={String(value)} /></List>;
}
`;

const candidate = (overrides: Partial<Candidate> & { name: string }): Candidate => ({
  viewCommands: ["index"],
  exclusions: [],
  network: false,
  stratum: "form",
  ...overrides,
});

test("a command without a mode counts as a view, and names are sorted", () => {
  expect(viewCommands({ commands: [{ name: "b" }, { name: "a", mode: "view" }] })).toEqual([
    "a",
    "b",
  ]);
  expect(viewCommands({ commands: [{ name: "c", mode: "no-view" }] })).toEqual([]);
  expect(viewCommands({})).toEqual([]);
});

test("runtime dependencies must be provided by Blast", () => {
  expect(unprovidedDependencies({ dependencies: { "@raycast/api": "^1.0.0" } })).toEqual([]);
  expect(
    unprovidedDependencies({
      dependencies: { "@raycast/utils": "2.3.2", zod: "^3", "node-fetch": "^2" },
    }),
  ).toEqual(["node-fetch", "zod"]);
  expect(manifestRejections({ dependencies: { axios: "^1" }, commands: [{ name: "a" }] })).toEqual([
    "unprovided dependencies: axios",
  ]);
});

test("a candidate needs at least one view command", () => {
  expect(manifestRejections({ commands: [{ name: "a", mode: "menu-bar" }] })).toEqual([
    "no view command",
  ]);
  expect(manifestRejections({ commands: [{ name: "a", mode: "view" }] })).toEqual([]);
});

test("shell-outs, AppleScript and filesystem writes are excluded", () => {
  expect(exclusionIds([source('import { exec } from "node:child_process";')])).toEqual([
    "child_process",
  ]);
  expect(exclusionIds([source('const script = "tell application \\"Finder\\"";')])).toEqual([
    "applescript",
  ]);
  expect(exclusionIds([source('await fs.writeFile("out.json", data);')])).toEqual([
    "filesystem-write",
  ]);
  expect(exclusionIds([source(LIST_SOURCE)])).toEqual([]);
});

test("filesystem reads are fine, native modules are not", () => {
  expect(
    exclusionIds([
      source(`import { readFile } from "node:fs/promises";
const text = await readFile("data.json", "utf8");
const dir = await readdir(".");`),
    ]),
  ).toEqual([]);
  expect(exclusionIds([source('import { connect } from "swift:../../swift";')])).toEqual([
    "native-module",
  ]);
});

test("network access is preferred away, not rejected", () => {
  expect(usesNetwork([source("const response = await fetch(url);")])).toBe(true);
  expect(usesNetwork([source('import { useFetch } from "@raycast/utils";')])).toBe(true);
  expect(usesNetwork([source('const endpoint = "https://example.com";')])).toBe(false);
  expect(usesNetwork([source(LIST_SOURCE)])).toBe(false);
});

test("one stratum per extension, ordered by how much it exercises", () => {
  expect(stratumOf([source(LIST_SOURCE)])).toBe("list-only");
  expect(stratumOf([source(FORM_SOURCE)])).toBe("form");
  expect(stratumOf([source(DETAIL_SOURCE)])).toBe("detail");
  expect(stratumOf([source(UTILS_SOURCE)])).toBe("utils");
  expect(stratumOf([source("export default function Command() { return null; }")])).toBe("none");
  // A Form that also uses a utils hook is a Form command first.
  expect(stratumOf([source(FORM_SOURCE), source(UTILS_SOURCE)])).toBe("form");
  // `<Detail.Metadata` and `<Form.TextField` are member components, not bare names.
  expect(stratumOf([source("<Detail.Metadata />")])).toBe("detail");
});

test("the utils stratum needs both the import and a pinned hook", () => {
  expect(stratumOf([source('import { usePromise } from "@raycast/utils";')])).toBe("none");
  expect(
    stratumOf([
      source(`import { showToast } from "@raycast/utils";
const value = useState(1);`),
    ]),
  ).toBe("none");
  expect(
    stratumOf([
      source(`import { useLocalStorage } from "@raycast/utils";
const [v] = useLocalStorage("k", 0);`),
    ]),
  ).toBe("utils");
  for (const hook of UTILS_HOOKS) {
    expect(stratumOf([source(`import { ${hook} } from "@raycast/utils";\n${hook}({});`)])).toBe(
      "utils",
    );
  }
});

test("analyzeSources gathers the verdict for one extension", () => {
  expect(analyzeSources("demo", ["index"], [source(FORM_SOURCE)])).toEqual({
    name: "demo",
    viewCommands: ["index"],
    exclusions: [],
    network: false,
    stratum: "form",
  });
});

test("eligibility requires a view command, a stratum and no exclusion", () => {
  expect(eligible(candidate({ name: "ok" }))).toBe(true);
  expect(eligible(candidate({ name: "excluded", exclusions: ["child_process"] }))).toBe(false);
  expect(eligible(candidate({ name: "blank", stratum: "none" }))).toBe(false);
  expect(eligible(candidate({ name: "headless", viewCommands: [] }))).toBe(false);
});

test("ranking is by name hash, so it does not depend on the input order", () => {
  const names = ["alpha", "beta", "gamma", "delta"];
  expect(rank("alpha")).toBe(rank("alpha"));
  expect(rank("alpha")).not.toBe(rank("beta"));
  const shuffled = [names[2]!, names[0]!, names[3]!, names[1]!].map((name) => candidate({ name }));
  expect(ranked(shuffled).map((c) => c.name)).toEqual(
    ranked([...shuffled].toReversed()).map((c) => c.name),
  );
  expect(ranked(shuffled).map((c) => c.name)).toEqual(
    [...names].toSorted((a, b) => rank(a).localeCompare(rank(b))),
  );
});

test("offline candidates rank before candidates that use a network", () => {
  const network = candidate({ name: "aaa", network: true });
  const offline = candidate({ name: "zzz" });
  expect(ranked([network, offline]).map((c) => c.name)).toEqual(["zzz", "aaa"]);
});

test("the selection keeps the original set first and fills every stratum quota", () => {
  const kept = ["keep-a", "keep-b"];
  const pool = [
    ...Array.from({ length: 4 }, (_, index) => candidate({ name: `form-${index}` })),
    ...Array.from({ length: 4 }, (_, index) =>
      candidate({ name: `detail-${index}`, stratum: "detail" }),
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      candidate({ name: `utils-${index}`, stratum: "utils" }),
    ),
    candidate({ name: "list-0", stratum: "list-only" }),
    candidate({ name: "rejected", exclusions: ["node"] }),
    candidate({ name: "networked", network: true }),
  ];
  const quotas: Quotas = { form: 2, detail: 2, utils: 2, "list-only": kept.length + 1 };
  const selection = selectCurated(kept, pool, quotas);
  expect(selection.curated.slice(0, 2)).toEqual(kept);
  expect(selection.picks.form).toHaveLength(2);
  expect(selection.picks.detail).toHaveLength(2);
  expect(selection.picks.utils).toHaveLength(2);
  expect(selection.picks["list-only"]).toEqual(["list-0"]);
  expect(selection.missing).toEqual({ form: 0, detail: 0, utils: 0, "list-only": 0 });
  expect(selection.curated).not.toContain("rejected");
  expect(selection.curated).not.toContain("networked");
  expect(new Set(selection.curated).size).toBe(selection.curated.length);
  // Order inside a stratum follows the name hash, not the pool order.
  expect(selection.picks.form).toEqual(
    [...selection.picks.form].toSorted((a, b) => rank(a).localeCompare(rank(b))),
  );
});

test("the default quotas are about 40 extensions with the kept set in list-only", () => {
  expect(DEFAULT_QUOTAS).toEqual({ form: 10, detail: 10, utils: 10, "list-only": 10 });
  expect(KEPT_CURATED).toHaveLength(DEFAULT_QUOTAS["list-only"]);
  expect(new Set(KEPT_CURATED).size).toBe(KEPT_CURATED.length);
  for (const name of KEPT_CURATED) expect(name).toMatch(/^[a-z0-9][a-z0-9-]*$/);
});

test("a pool that cannot fill a stratum reports the shortfall instead of padding", () => {
  const selection = selectCurated(["keep"], [candidate({ name: "form-0" })], {
    form: 2,
    detail: 1,
    utils: 1,
    "list-only": 1,
  });
  expect(selection.missing).toEqual({ form: 1, detail: 1, utils: 1, "list-only": 0 });
  expect(selectCurated(["keep"], [], DEFAULT_QUOTAS).curated).toEqual(["keep"]);
});

test("a kept extension is never picked twice", () => {
  const selection = selectCurated(
    ["form-0"],
    [candidate({ name: "form-0" }), candidate({ name: "form-1" })],
    { form: 2, detail: 0, utils: 0, "list-only": 1 },
  );
  expect(selection.picks.form).toEqual(["form-1"]);
});

test("repeated selection over the same pool is identical", () => {
  const pool = [
    ...Array.from({ length: 30 }, (_, index) => candidate({ name: `form-${index}` })),
    ...Array.from({ length: 30 }, (_, index) =>
      candidate({ name: `detail-${index}`, stratum: "detail" }),
    ),
    ...Array.from({ length: 30 }, (_, index) =>
      candidate({ name: `utils-${index}`, stratum: "utils", network: index % 2 === 0 }),
    ),
  ];
  const kept = Array.from({ length: 10 }, (_, index) => `kept-${index}`);
  const first = selectCurated(kept, pool);
  const second = selectCurated(kept, [...pool].toReversed());
  expect(second).toEqual(first);
  expect(first.curated).toHaveLength(40);
  expect(new Set(first.curated).size).toBe(40);
});

test("offline capacity counts the eligible candidates a stratum can still draw from", () => {
  const pool = [
    candidate({ name: "offline-form" }),
    candidate({ name: "online-form", network: true }),
    candidate({ name: "online-detail", network: true, stratum: "detail" }),
    candidate({ name: "excluded", exclusions: ["child_process"] }),
    candidate({ name: "headless", stratum: "none" }),
  ];
  expect(capacity(pool, false)).toEqual({ form: 1, detail: 0, utils: 0, "list-only": 0 });
  expect(capacity(pool, true)).toEqual({ form: 1, detail: 1, utils: 0, "list-only": 0 });
});

test("offline quotas decide whether the selector has to keep scanning", () => {
  const quotas: Quotas = { form: 1, detail: 0, utils: 0, "list-only": 1 };
  expect(offlineQuotasMet(["keep"], [candidate({ name: "form" })], quotas)).toBe(true);
  expect(offlineQuotasMet(["keep"], [candidate({ name: "form", network: true })], quotas)).toBe(
    false,
  );
});

test("strataMembers lists the kept extensions under list-only", () => {
  const selection = selectCurated(["keep-a", "keep-b"], [candidate({ name: "form-0" })], {
    form: 1,
    detail: 0,
    utils: 0,
    "list-only": 2,
  });
  expect(strataMembers(selection)).toEqual({
    form: ["form-0"],
    detail: [],
    utils: [],
    "list-only": ["keep-a", "keep-b"],
  });
});

test("the rendered pin is valid JSON with the criteria and the pin intact", () => {
  const selection = selectCurated(["keep-a"], [candidate({ name: "form-0" })], {
    form: 1,
    detail: 0,
    utils: 0,
    "list-only": 1,
  });
  const text = renderPin(
    { repository: "https://example.com/extensions.git", commit: "a".repeat(40) },
    selection,
    { scanned: 12, eligible: 3 },
  );
  expect(text.endsWith("\n")).toBe(true);
  const parsed = JSON.parse(text);
  expect(parsed.curated).toEqual(["keep-a", "form-0"]);
  expect(parsed.selection.criteria).toEqual(SELECTION_CRITERIA);
  expect(SELECTION_CRITERIA.script).toBe("scripts/corpus/select.ts");
  expect(parsed.selection.scanned).toBe(12);
  expect(parsed.selection.eligible).toBe(3);
  // readPin must keep accepting the file it writes.
  expect(parsePin(parsed)).toMatchObject({ curated: ["keep-a", "form-0"] });
});
