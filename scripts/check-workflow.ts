// Guards the agent workflow described in AGENTS.md against drift: file size
// limits and task file shape.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const LINE_LIMITS: Record<string, number> = {
  "AGENTS.md": 200,
  "PLAN.md": 120,
  "docs/architecture.md": 200,
  "docs/cli.md": 120,
  "docs/capabilities.md": 150,
  "docs/embedding.md": 150,
  "docs/quickstart.md": 120,
  "docs/tui.md": 120,
};
export const DECISION_LINE_LIMIT = 60;
export const TASK_STATUSES = ["todo", "doing", "review"] as const;
export const TASK_SECTIONS = ["Goal", "Context", "Acceptance", "Out of scope", "Handoff"];
export const TASK_FILE = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

function lineCount(path: string): number {
  return readFileSync(path, "utf8").split("\n").length;
}

export function parseFrontmatter(text: string): Record<string, unknown> | undefined {
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
    for (const name of readdirSync(decisions).toSorted()) {
      const lines = lineCount(join(decisions, name));
      if (lines > DECISION_LINE_LIMIT) {
        errors.push(`docs/decisions/${name}: ${lines} lines exceeds ${DECISION_LINE_LIMIT}`);
      }
    }
  }

  const tasks = join(root, "tasks");
  const ids = new Map<string, string>();
  for (const name of existsSync(tasks) ? readdirSync(tasks).toSorted() : []) {
    if (name === "_template.md") continue;
    errors.push(...checkTask(name, readFileSync(join(tasks, name), "utf8")));
    const id = name.slice(0, 4);
    const previous = ids.get(id);
    if (previous) errors.push(`tasks/${name}: id ${id} already used by ${previous}`);
    ids.set(id, name);
  }

  return errors;
}

/**
 * The repo is public: committed files must not name the machine they were
 * written on. Flags tracked text files containing `home` (the current user's
 * home directory), which catches absolute paths like `<home>/Projects/...`.
 */
export function findHomePaths(
  files: Array<{ path: string; text: string }>,
  home: string,
): string[] {
  const needle = home.replace(/\/+$/, "");
  // A root or very short home (containers, CI as root) would match everything.
  if (needle.split("/").filter(Boolean).length < 2) return [];
  return files
    .filter((file) => file.text.includes(`${needle}/`))
    .map((file) => `${file.path}: contains the local home directory path`);
}

function trackedTextFiles(root: string): Array<{ path: string; text: string }> {
  const listed = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  if (listed.status !== 0) return [];
  return listed.stdout
    .split("\0")
    .filter((path) => path && !/\.(?:png|jpe?g|gif|ico|tgz|gz|wasm|zip|pdf)$/i.test(path))
    .flatMap((path) => {
      try {
        return [{ path, text: readFileSync(join(root, path), "utf8") }];
      } catch {
        return [];
      }
    });
}

if (import.meta.main) {
  const root = process.cwd();
  const errors = [...checkWorkflow(root), ...findHomePaths(trackedTextFiles(root), homedir())];
  for (const error of errors) console.error(`workflow: ${error}`);
  if (errors.length > 0) process.exit(1);
  console.log("workflow: ok");
}
