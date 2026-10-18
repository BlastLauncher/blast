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
  FEATURE_STRATA,
  featureCapacity,
  featuresOf,
  IMPORT_EXCLUSION,
  KEPT_CURATED,
  manifestRejections,
  matchesStratum,
  offlineQuotasMet,
  PICK_STRATA,
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
import type { Source } from "./imports.ts";

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

const GRID_SOURCE = `import { Grid } from "@raycast/api";
export default function Command() {
  return <Grid><Grid.Item content="a" /></Grid>;
}
`;

const MENU_BAR_SOURCE = `import { MenuBarExtra } from "@raycast/api";
export default function Command() {
  return <MenuBarExtra title="Ready" />;
}
`;

const ACTION_VARIANT_SOURCE = `import { Action, ActionPanel, List } from "@raycast/api";
export default function Command() {
  return (
    <List>
      <List.Item title="one" actions={<ActionPanel><Action.Open title="Open" target="https://example.com" /></ActionPanel>} />
    </List>
  );
}
`;

const SELECTION_API_SOURCE = `import { ActionPanel, List, getSelectedText } from "@raycast/api";
export default function Command() {
  const text = getSelectedText();
  return <List><List.Item title={String(text)} actions={<ActionPanel><Action.CopyToClipboard content="x" /></ActionPanel>} /></List>;
}
`;

/** The picks only a stratum's own test cares about; the rest stay at zero. */
const quotasFor = (overrides: Partial<Quotas>): Quotas => ({ ...zeroQuotas(), ...overrides });

const zeroQuotas = (): Quotas =>
  Object.fromEntries(PICK_STRATA.map((stratum) => [stratum, 0])) as Quotas;

const candidate = (overrides: Partial<Candidate> & { name: string }): Candidate => ({
  viewCommands: ["index"],
  exclusions: [],
  network: false,
  stratum: "form",
  features: [],
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
    IMPORT_EXCLUSION,
  ]);
});

test("an unprovided import rejects the candidate", () => {
  expect(exclusionIds([source('import { gql } from "graphql-request";')])).toEqual([
    IMPORT_EXCLUSION,
  ]);
  // Blast's provided dependencies, relative paths and Node built-ins resolve;
  // the specifier rules themselves are tested in `imports.test.ts`.
  expect(
    exclusionIds([
      source(`import { List } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { useState } from "react";
import { readFile } from "node:fs/promises";
import { helper } from "./helper";
export * from "../shared";`),
    ]),
  ).toEqual([]);
  expect(IMPORT_EXCLUSION).toBe("unprovided-import");
  expect(SELECTION_CRITERIA.excludedSources).toContain(IMPORT_EXCLUSION);
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

test("featuresOf tags the harder components and APIs additively", () => {
  expect(featuresOf([source(LIST_SOURCE)])).toEqual([]);
  expect(featuresOf([source(GRID_SOURCE)])).toEqual(["grid"]);
  expect(featuresOf([source(MENU_BAR_SOURCE)])).toEqual(["menu-bar"]);
  expect(featuresOf([source(ACTION_VARIANT_SOURCE)])).toEqual(["action-variants"]);
  expect(featuresOf([source(SELECTION_API_SOURCE)])).toEqual(["selection-apis"]);
  expect(
    featuresOf([
      source(`import { Action, ActionPanel, Grid } from "@raycast/api";
const Command = () => (
  <Grid>
    <Grid.Item
      content="a"
      actions={
        <ActionPanel>
          <ActionPanel.Submenu title="More">
            <Action.CopyToClipboard content="x" />
          </ActionPanel.Submenu>
        </ActionPanel>
      }
    />
  </Grid>
);`),
    ]),
  ).toEqual(["grid", "action-variants"]);
  expect(FEATURE_STRATA).toEqual(["grid", "menu-bar", "action-variants", "selection-apis"]);
});

test("the covered actions are not action variants", () => {
  for (const name of ["CopyToClipboard", "OpenInBrowser", "Paste", "Push", "SubmitForm"]) {
    expect(featuresOf([source(`<Action.${name} />`)])).toEqual([]);
  }
  expect(featuresOf([source('<Action.Open target="https://example.com" />')])).toEqual([
    "action-variants",
  ]);
  expect(featuresOf([source('<Action.ShowInFinder path="/tmp/report.pdf" />')])).toEqual([
    "action-variants",
  ]);
  expect(featuresOf([source('<ActionPanel.Submenu title="More" />')])).toEqual(["action-variants"]);
  expect(featuresOf([source("getSelectedFinderItems();")])).toEqual(["selection-apis"]);
  expect(featuresOf([source('<Form.FilePicker id="files" />')])).toEqual(["selection-apis"]);
});

test("features never reclassify the exclusive stratum", () => {
  // The first 40 picks must not move, so a Form with a FilePicker stays a Form.
  expect(stratumOf([source(FORM_SOURCE), source('<Form.FilePicker id="files" />')])).toBe("form");
  expect(stratumOf([source(GRID_SOURCE)])).toBe("none");
  expect(stratumOf([source(MENU_BAR_SOURCE)])).toBe("none");
  expect(stratumOf([source(ACTION_VARIANT_SOURCE)])).toBe("list-only");
});

test("matchesStratum reads the exclusive view or the additive feature", () => {
  const gridOnly = candidate({ name: "grid", stratum: "none", features: ["grid"] });
  expect(matchesStratum(gridOnly, "grid")).toBe(true);
  expect(matchesStratum(gridOnly, "form")).toBe(false);
  const form = candidate({ name: "form", stratum: "form" });
  expect(matchesStratum(form, "form")).toBe(true);
  expect(matchesStratum(form, "grid")).toBe(false);
});

test("analyzeSources gathers the verdict for one extension", () => {
  expect(analyzeSources("demo", ["index"], [source(FORM_SOURCE)])).toEqual({
    name: "demo",
    viewCommands: ["index"],
    exclusions: [],
    network: false,
    stratum: "form",
    features: [],
  });
  expect(analyzeSources("demo", ["index"], [source(GRID_SOURCE)])).toMatchObject({
    stratum: "none",
    features: ["grid"],
  });
});

test("eligibility requires a view command, a stratum or feature, and no exclusion", () => {
  expect(eligible(candidate({ name: "ok" }))).toBe(true);
  expect(eligible(candidate({ name: "excluded", exclusions: ["child_process"] }))).toBe(false);
  expect(eligible(candidate({ name: "blank", stratum: "none" }))).toBe(false);
  expect(eligible(candidate({ name: "headless", viewCommands: [] }))).toBe(false);
  // A Grid-only extension has no exclusive stratum, but its feature makes it a pick.
  expect(eligible(candidate({ name: "grid", stratum: "none", features: ["grid"] }))).toBe(true);
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
  const quotas = quotasFor({ form: 2, detail: 2, utils: 2, "list-only": kept.length + 1 });
  const selection = selectCurated(kept, pool, quotas);
  expect(selection.curated.slice(0, 2)).toEqual(kept);
  expect(selection.picks.form).toHaveLength(2);
  expect(selection.picks.detail).toHaveLength(2);
  expect(selection.picks.utils).toHaveLength(2);
  expect(selection.picks["list-only"]).toEqual(["list-0"]);
  expect(selection.missing).toEqual(zeroQuotas());
  expect(selection.curated).not.toContain("rejected");
  expect(selection.curated).not.toContain("networked");
  expect(new Set(selection.curated).size).toBe(selection.curated.length);
  // Order inside a stratum follows the name hash, not the pool order.
  expect(selection.picks.form).toEqual(
    [...selection.picks.form].toSorted((a, b) => rank(a).localeCompare(rank(b))),
  );
});

test("the default quotas keep the first 40 picks and add about 20 harder ones", () => {
  expect(DEFAULT_QUOTAS).toEqual({
    form: 10,
    detail: 10,
    utils: 10,
    "list-only": 10,
    grid: 5,
    "menu-bar": 5,
    "action-variants": 5,
    "selection-apis": 5,
  });
  // The exclusive strata stay first, so the first 40 picks cannot move (0033).
  expect(PICK_STRATA).toEqual([
    "form",
    "detail",
    "utils",
    "list-only",
    "grid",
    "menu-bar",
    "action-variants",
    "selection-apis",
  ]);
  expect(KEPT_CURATED).toHaveLength(DEFAULT_QUOTAS["list-only"]);
  expect(new Set(KEPT_CURATED).size).toBe(KEPT_CURATED.length);
  for (const name of KEPT_CURATED) expect(name).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  // Every additive stratum is a real feature the selector can match.
  for (const stratum of FEATURE_STRATA)
    expect(SELECTION_CRITERIA.featureStrata[stratum]).toBeTruthy();
});

test("a pool that cannot fill a stratum reports the shortfall instead of padding", () => {
  const selection = selectCurated(
    ["keep"],
    [candidate({ name: "form-0" })],
    quotasFor({ form: 2, detail: 1, utils: 1, "list-only": 1 }),
  );
  expect(selection.missing).toEqual(quotasFor({ form: 1, detail: 1, utils: 1 }));
  expect(selectCurated(["keep"], [], DEFAULT_QUOTAS).curated).toEqual(["keep"]);
});

test("a kept extension is never picked twice", () => {
  const selection = selectCurated(
    ["form-0"],
    [candidate({ name: "form-0" }), candidate({ name: "form-1" })],
    quotasFor({ form: 2, "list-only": 1 }),
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
    ...FEATURE_STRATA.flatMap((stratum) =>
      Array.from({ length: 5 }, (_, index) =>
        candidate({ name: `${stratum}-${index}`, stratum: "none", features: [stratum] }),
      ),
    ),
  ];
  const kept = Array.from({ length: 10 }, (_, index) => `kept-${index}`);
  const first = selectCurated(kept, pool);
  const second = selectCurated(kept, [...pool].toReversed());
  expect(second).toEqual(first);
  expect(first.missing).toEqual(zeroQuotas());
  expect(first.curated).toHaveLength(60);
  expect(first.curated.slice(0, 10)).toEqual(kept);
  expect(new Set(first.curated).size).toBe(60);
});

test("the additive strata fill after the exclusive ones and never reuse a pick", () => {
  const pool = [
    candidate({ name: "form-0" }),
    candidate({ name: "grid-0", stratum: "none", features: ["grid"] }),
    candidate({ name: "grid-1", stratum: "none", features: ["grid"] }),
    candidate({ name: "menu-0", stratum: "none", features: ["menu-bar"] }),
    candidate({ name: "variant-0", stratum: "none", features: ["action-variants"] }),
    candidate({ name: "selection-0", stratum: "none", features: ["selection-apis"] }),
  ];
  const selection = selectCurated(
    ["keep"],
    pool,
    quotasFor({
      form: 1,
      "list-only": 1,
      grid: 2,
      "menu-bar": 1,
      "action-variants": 1,
      "selection-apis": 1,
    }),
  );
  expect(selection.missing).toEqual(zeroQuotas());
  expect(selection.curated).toEqual([
    "keep",
    "form-0",
    ...selection.picks.grid,
    "menu-0",
    "variant-0",
    "selection-0",
  ]);
  expect(new Set(selection.curated).size).toBe(7);
});

test("a pick for an exclusive stratum is not picked again for a feature", () => {
  const selection = selectCurated(
    [],
    [
      candidate({ name: "only", features: ["grid"] }),
      candidate({ name: "other", features: ["grid"] }),
    ],
    quotasFor({ form: 1, grid: 2 }),
  );
  expect(selection.picks.form).toHaveLength(1);
  expect(selection.picks.grid).toHaveLength(1);
  expect(selection.picks.grid[0]).not.toBe(selection.picks.form[0]);
  expect(selection.missing.form).toBe(0);
  expect(selection.missing.grid).toBe(1);
  expect(new Set(selection.curated).size).toBe(selection.curated.length);
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

test("feature capacity counts eligible candidates per additive stratum", () => {
  const pool = [
    candidate({ name: "grid-offline", stratum: "none", features: ["grid"] }),
    candidate({ name: "grid-online", stratum: "none", features: ["grid"], network: true }),
    candidate({
      name: "grid-excluded",
      stratum: "none",
      features: ["grid"],
      exclusions: ["child_process"],
    }),
    candidate({ name: "both", features: ["grid", "selection-apis"] }),
  ];
  expect(featureCapacity(pool, false)).toEqual({
    grid: 2,
    "menu-bar": 0,
    "action-variants": 0,
    "selection-apis": 1,
  });
  expect(featureCapacity(pool, true)).toEqual({
    grid: 1,
    "menu-bar": 0,
    "action-variants": 0,
    "selection-apis": 0,
  });
});

test("offline quotas decide whether the selector has to keep scanning", () => {
  const quotas = quotasFor({ form: 1, "list-only": 1 });
  expect(offlineQuotasMet(["keep"], [candidate({ name: "form" })], quotas)).toBe(true);
  expect(offlineQuotasMet(["keep"], [candidate({ name: "form", network: true })], quotas)).toBe(
    false,
  );
  const featureQuotas = quotasFor({ grid: 1 });
  const grid = candidate({ name: "grid", stratum: "none", features: ["grid"] });
  expect(offlineQuotasMet([], [grid], featureQuotas)).toBe(true);
  expect(offlineQuotasMet([], [{ ...grid, network: true }], featureQuotas)).toBe(false);
});

test("strataMembers lists the kept extensions under list-only", () => {
  const selection = selectCurated(
    ["keep-a", "keep-b"],
    [candidate({ name: "form-0" })],
    quotasFor({ form: 1, "list-only": 2 }),
  );
  expect(strataMembers(selection)).toEqual({
    form: ["form-0"],
    detail: [],
    utils: [],
    "list-only": ["keep-a", "keep-b"],
    grid: [],
    "menu-bar": [],
    "action-variants": [],
    "selection-apis": [],
  });
});

test("the rendered pin is valid JSON with the criteria and the pin intact", () => {
  const selection = selectCurated(
    ["keep-a"],
    [
      candidate({ name: "form-0" }),
      candidate({ name: "grid-0", stratum: "none", features: ["grid"] }),
    ],
    quotasFor({ form: 1, "list-only": 1, grid: 1 }),
  );
  const text = renderPin(
    { repository: "https://example.com/extensions.git", commit: "a".repeat(40) },
    selection,
    { scanned: 12, eligible: 3 },
  );
  expect(text.endsWith("\n")).toBe(true);
  const parsed = JSON.parse(text);
  expect(parsed.curated).toEqual(["keep-a", "form-0", "grid-0"]);
  expect(parsed.selection.criteria).toEqual(SELECTION_CRITERIA);
  expect(parsed.selection.strata.grid).toEqual(["grid-0"]);
  expect(SELECTION_CRITERIA.script).toBe("scripts/corpus/select.ts");
  expect(parsed.selection.scanned).toBe(12);
  expect(parsed.selection.eligible).toBe(3);
  // readPin must keep accepting the file it writes.
  expect(parsePin(parsed)).toMatchObject({ curated: ["keep-a", "form-0", "grid-0"] });
});
