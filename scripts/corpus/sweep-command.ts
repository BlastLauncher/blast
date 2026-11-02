// One sandboxed sweep unit. The parent process never bundles or launches an
// extension itself; this helper does both while inheriting the Seatbelt profile.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runOne } from "./smoke-command.ts";
import { buildResult, compactLine, sanitizePath, type Manifest } from "./smoke.ts";

const [extension, extensionDir, command, scratch] = process.argv.slice(2);
if (!extension || !extensionDir || !command || !scratch) {
  console.error("sweep-command: expected extension, extension directory, command and scratch");
  process.exit(2);
}

const clean = (text: string): string =>
  compactLine(
    sanitizePath(text, [
      [process.cwd(), "<repo>"],
      [scratch, "<scratch>"],
    ]),
  );

try {
  const manifest = JSON.parse(
    await readFile(join(extensionDir, "package.json"), "utf8"),
  ) as Manifest;
  process.env.BLAST_SWEEP_SCRATCH = scratch;
  const result = await runOne(extension, extensionDir, manifest, command, clean);
  process.stdout.write(`SWEEP_RESULT ${JSON.stringify(result)}\n`);
} catch (error) {
  const result = buildResult({
    extension,
    command,
    mode: "view",
    probe: {
      kind: "exit",
      code: 1,
      signal: null,
      error: { message: clean(error instanceof Error ? error.message : String(error)) },
    },
  });
  process.stdout.write(`SWEEP_RESULT ${JSON.stringify(result)}\n`);
}
