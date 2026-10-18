// Explicit network entry point. Sparse batches contain source files only;
// Git's retained blob packs count against the same budget as the working tree.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readInventory } from "../compat/generate-coverage.ts";
import {
  buildPatterns,
  checkDiskBudget,
  CORPUS_DIR,
  directoryBytes,
  maxMbFromEnv,
  megabytes,
  readPin,
} from "./corpus.ts";
import {
  aggregateUsage,
  scanExtension,
  USAGE_PATH,
  type ExtensionUsage,
  type Source,
} from "./usage.ts";

export function sourcePatterns(names: string[]): string[] {
  // Seven pinned directories predate today's publishing rule (case, dot or underscore).
  // Still exclude slashes and every Git pattern metacharacter.
  if (names.some((name) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)))
    throw new Error("invalid extension name");
  // Git wildmatch supports **/ matching zero or more directories, but not braces.
  return [
    ...buildPatterns(),
    ...[...new Set(names)]
      .toSorted()
      .flatMap((name) =>
        ["ts", "tsx", "js", "jsx"].map((ext) => `/extensions/${name}/src/**/*.${ext}`),
      ),
  ];
}

function run(cwd: string, command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed (${result.status})`);
}

export function* sources(dir: string): Generator<Source> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(file);
    else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(file))
      yield { file, source: readFileSync(file, "utf8") };
  }
}

function main(): void {
  const started = performance.now();
  const root = process.cwd();
  const pin = readPin(root);
  const repo = join(root, CORPUS_DIR);
  const maxMb = maxMbFromEnv(process.env);
  let peak = directoryBytes(join(root, ".cache"));
  const guard = () => {
    const bytes = directoryBytes(repo);
    peak = Math.max(peak, directoryBytes(join(root, ".cache")));
    const over = checkDiskBudget(bytes, maxMb);
    if (over) throw new Error(over);
  };
  guard();
  run(root, "bun", ["run", "corpus:fetch"]);
  guard();
  const names = readdirSync(join(repo, "extensions"), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(repo, "extensions", entry.name, "package.json")),
    )
    .map((entry) => entry.name)
    .toSorted();
  const known = new Set(readInventory(root).entries.map((entry) => entry.path));
  const results: ExtensionUsage[] = [];
  try {
    for (let offset = 0; offset < names.length; offset += 200) {
      const batch = names.slice(offset, offset + 200);
      run(repo, "git", ["sparse-checkout", "set", "--no-cone", ...sourcePatterns(batch)]);
      guard();
      for (const name of batch) {
        const result = scanExtension(sources(join(repo, "extensions", name, "src")), known);
        for (const failure of result.failures) console.error(`parse: ${failure}`);
        results.push(result);
      }
      run(repo, "git", ["sparse-checkout", "set", "--no-cone", ...buildPatterns()]);
      guard();
      console.log(`scan: ${results.length}/${names.length}, peak .cache ${megabytes(peak)} MB`);
    }
  } finally {
    run(repo, "git", ["sparse-checkout", "set", "--no-cone", ...buildPatterns()]);
  }
  writeFileSync(
    join(root, USAGE_PATH),
    `${JSON.stringify(aggregateUsage(pin.commit, known, results), null, 2)}\n`,
  );
  console.log(
    `scan: ${names.length} extensions, utils imports ${results.filter((r) => r.utils).length}, parse failures ${results.reduce((n, r) => n + r.failures.length, 0)}, peak .cache ${megabytes(peak)} MB, ${((performance.now() - started) / 1000).toFixed(1)}s`,
  );
}

if (import.meta.main) main();
