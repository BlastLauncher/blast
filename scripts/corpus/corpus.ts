// Pure helpers for the pinned corpus checkout that `bun run corpus:fetch`
// maintains: pin validation, sparse-checkout pattern building, the CLI
// argument parser and the disk-budget decision. Nothing here runs git or
// touches the network, so every rule is unit-testable offline.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const CORPUS_PIN_PATH = "compat/corpus.json";
export const CORPUS_DIR = ".cache/raycast-extensions";
export const MAX_MB_ENV = "BLAST_CORPUS_MAX_MB";
export const DEFAULT_MAX_MB = 600;
/** Extension directory names follow the rule Raycast enforces for publishing. */
export const EXTENSION_NAME = /^[a-z0-9][a-z0-9-]*$/;
export const COMMIT_SHA = /^[0-9a-f]{40}$/;
/** Every extension manifest: the smallest checkout that still maps the corpus. */
export const MANIFEST_PATTERN = "/extensions/*/package.json";

export type CorpusPin = { repository: string; commit: string; curated: string[] };
export type FetchOptions = { extensions: string[]; curated: boolean };

export function isValidExtensionName(name: string): boolean {
  return EXTENSION_NAME.test(name);
}

function requireName(value: unknown, at: string): string {
  if (typeof value !== "string" || !isValidExtensionName(value)) {
    throw new Error(`${at}: ${JSON.stringify(value)} must match ${EXTENSION_NAME}`);
  }
  return value;
}

/** Validate a parsed `compat/corpus.json`; throws with a fixable message. */
export function parsePin(value: unknown): CorpusPin {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("corpus pin: must be a JSON object");
  }
  const source = value as Record<string, unknown>;
  const { repository, commit, curated } = source;
  if (typeof repository !== "string" || repository === "") {
    throw new Error("corpus pin: repository must be a non-empty string");
  }
  if (typeof commit !== "string" || !COMMIT_SHA.test(commit)) {
    throw new Error(
      `corpus pin: commit must be 40 lowercase hex characters, got ${JSON.stringify(commit)}`,
    );
  }
  if (!Array.isArray(curated))
    throw new Error("corpus pin: curated must be a list of extension names");
  if (curated.length === 0) throw new Error("corpus pin: curated must not be empty");
  const names = curated.map((name) => requireName(name, "corpus pin: curated"));
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate !== undefined) throw new Error(`corpus pin: curated lists ${duplicate} twice`);
  return { repository, commit, curated: names };
}

export function readPin(root: string): CorpusPin {
  const path = join(root, CORPUS_PIN_PATH);
  if (!existsSync(path)) throw new Error(`${CORPUS_PIN_PATH}: missing`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${CORPUS_PIN_PATH}: invalid JSON (${detail})`, { cause: error });
  }
  return parsePin(parsed);
}

/**
 * Sparse-checkout patterns for the requested extensions. The default manifest
 * pattern always applies, so the corpus stays mappable; each requested
 * extension contributes its whole directory (assets included) minus
 * `node_modules/`, which must come after the include it narrows because the
 * last matching pattern decides.
 */
export function buildPatterns(extensions: string[] = []): string[] {
  for (const name of extensions) requireName(name, "--extension");
  const names = [...new Set(extensions)].toSorted();
  return [
    MANIFEST_PATTERN,
    ...names.map((name) => `/extensions/${name}/`),
    ...names.map((name) => `!/extensions/${name}/node_modules/`),
  ];
}

/** Bytes as megabytes, rounded to one decimal for budget messages. */
export function megabytes(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

/** Disk-budget decision: `undefined` when within budget, else why it aborts. */
export function checkDiskBudget(bytes: number, maxMb: number): string | undefined {
  const limit = maxMb * 1024 * 1024;
  if (bytes <= limit) return undefined;
  return `${megabytes(bytes)} MB is above ${MAX_MB_ENV}=${maxMb} MB; delete ${CORPUS_DIR} or raise the budget`;
}

/** Batches smaller than this lose most of the benefit to script overhead. */
export const MIN_BATCH_SIZE = 5;
/** Batches larger than this approach checking everything out at once. */
export const MAX_BATCH_SIZE = 20;
/**
 * Extensions a checkout this heavy might plausibly need; curated extensions
 * with assets run well under this, so sizing against it is conservative.
 */
export const ASSUMED_MB_PER_EXTENSION = 15;

/**
 * How many extensions one sparse-checkout batch should hold. Narrowing
 * `sparse-checkout` between batches drops a batch's files from the working
 * tree, but not the blobs `.git` already fetched for them — by the final
 * batch, the budget has to cover every blob fetched across every batch, so
 * only a batch's own working tree is free to size down. A smaller budget
 * gets a smaller batch, leaving more of it for what earlier batches left
 * behind in `.git`.
 */
export function batchSize(maxMb: number): number {
  const bySize = Math.floor(maxMb / ASSUMED_MB_PER_EXTENSION);
  return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, bySize));
}

export function maxMbFromEnv(env: Record<string, string | undefined>): number {
  const raw = env[MAX_MB_ENV];
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_MB;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${MAX_MB_ENV}: ${JSON.stringify(raw)} is not a positive number of megabytes`);
  }
  return value;
}

/** Apparent size of a checkout, used only by the budget check. */
export function directoryBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += directoryBytes(path);
    else if (entry.isFile()) total += statSync(path).size;
  }
  return total;
}

export function parseArgs(argv: string[]): FetchOptions {
  const extensions: string[] = [];
  let curated = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--curated") {
      curated = true;
    } else if (arg === "--extension" || arg.startsWith("--extension=")) {
      const value = arg === "--extension" ? argv[++index] : arg.slice("--extension=".length);
      if (value === undefined) throw new Error("--extension needs an extension name");
      extensions.push(requireName(value, "--extension"));
    } else {
      throw new Error(
        `unknown argument ${arg}; usage: corpus:fetch [--extension <name>]... [--curated]`,
      );
    }
  }
  return { extensions, curated };
}
