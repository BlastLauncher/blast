// Guards the agent workflow described in AGENTS.md against drift: file size
// limits, task file shape, and imports from the frozen archive.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const LINE_LIMITS: Record<string, number> = {
  "AGENTS.md": 200,
  "PLAN.md": 120,
  "docs/architecture.md": 200,
  "docs/cli.md": 120,
};
export const DECISION_LINE_LIMIT = 60;
export const TASK_STATUSES = ["todo", "doing", "review"] as const;
export const TASK_SECTIONS = ["Goal", "Context", "Acceptance", "Out of scope", "Handoff"];
const TASK_FILE = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const ARCHIVE_IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'][^"']*\barchive\//;
const SOURCE_DIRS = ["packages", "scripts"];

function lineCount(path: string): number {
  return readFileSync(path, "utf8").split("\n").length;
}

function parseFrontmatter(text: string): Record<string, unknown> | undefined {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match?.[1]) return undefined;
  const data: unknown = Bun.YAML.parse(match[1]);
  return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
}

export function checkTask(name: string, text: string): string[] {
  const errors: string[] = [];
  const at = `tasks/${name}`;
  const fileMatch = TASK_FILE.exec(name);
  if (!fileMatch) return [`${at}: name must match NNNN-short-slug.md`];

  const fm = parseFrontmatter(text);
  if (!fm) return [`${at}: missing YAML frontmatter`];
  if (String(fm.id) !== fileMatch[1]) errors.push(`${at}: id must be "${fileMatch[1]}"`);
  if (typeof fm.title !== "string" || fm.title.trim() === "") errors.push(`${at}: missing title`);
  if (fm.status === "done") {
    errors.push(`${at}: done tasks must be deleted, not kept`);
  } else if (!TASK_STATUSES.includes(fm.status as (typeof TASK_STATUSES)[number])) {
    errors.push(`${at}: status must be one of ${TASK_STATUSES.join("|")}`);
  }
  if (typeof fm.milestone !== "string" || !/^M\d+$/.test(fm.milestone)) {
    errors.push(`${at}: milestone must look like M1`);
  }
  if (!Array.isArray(fm.depends) || fm.depends.some((d) => !/^\d{4}$/.test(String(d)))) {
    errors.push(`${at}: depends must be a list of four-digit ids`);
  }
  for (const section of TASK_SECTIONS) {
    if (!new RegExp(`^## ${section}\\s*$`, "m").test(text)) {
      errors.push(`${at}: missing "## ${section}" section`);
    }
  }
  return errors;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

export function checkWorkflow(root: string): string[] {
  const errors: string[] = [];

  for (const [file, limit] of Object.entries(LINE_LIMITS)) {
    const path = join(root, file);
    if (!existsSync(path)) {
      if (!file.startsWith("docs/")) errors.push(`${file}: missing`);
      continue;
    }
    const lines = lineCount(path);
    if (lines > limit) errors.push(`${file}: ${lines} lines exceeds limit of ${limit}`);
  }

  const decisions = join(root, "docs/decisions");
  if (existsSync(decisions)) {
    for (const name of readdirSync(decisions)) {
      const lines = lineCount(join(decisions, name));
      if (lines > DECISION_LINE_LIMIT) {
        errors.push(`docs/decisions/${name}: ${lines} lines exceeds ${DECISION_LINE_LIMIT}`);
      }
    }
  }

  const tasks = join(root, "tasks");
  const ids = new Map<string, string>();
  for (const name of existsSync(tasks) ? readdirSync(tasks) : []) {
    if (name === "_template.md") continue;
    errors.push(...checkTask(name, readFileSync(join(tasks, name), "utf8")));
    const id = name.slice(0, 4);
    const previous = ids.get(id);
    if (previous) errors.push(`tasks/${name}: id ${id} already used by ${previous}`);
    ids.set(id, name);
  }

  for (const dir of SOURCE_DIRS) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const path of walk(base)) {
      if (!/\.(?:[cm]?[jt]sx?)$/.test(path)) continue;
      if (ARCHIVE_IMPORT.test(readFileSync(path, "utf8"))) {
        errors.push(`${relative(root, path)}: imports from archive/`);
      }
    }
  }

  return errors;
}

if (import.meta.main) {
  const errors = checkWorkflow(process.cwd());
  for (const error of errors) console.error(`workflow: ${error}`);
  if (errors.length > 0) process.exit(1);
  console.log("workflow: ok");
}
