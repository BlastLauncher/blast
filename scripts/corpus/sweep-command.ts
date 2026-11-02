// One sandboxed sweep unit. The parent process never bundles or launches an
// extension itself; this helper does both while inheriting the Seatbelt profile.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { launchOne } from "./smoke-command.ts";
import type { BundledCommand } from "../../packages/host/src/index.ts";
import { buildResult, compactLine, sanitizeReportText, type Manifest } from "./smoke.ts";

const [extension, extensionDir, command, scratch, bundlePath] = process.argv.slice(2);
if (!extension || !extensionDir || !command || !scratch || !bundlePath) {
  console.error(
    "sweep-command: expected extension, extension directory, command, scratch and bundle metadata",
  );
  process.exit(2);
}

const clean = (text: string): string =>
  compactLine(
    sanitizeReportText(
      text,
      [
        [process.cwd(), "<repo>"],
        [scratch, "<scratch>"],
      ],
      homedir(),
    ),
  );

try {
  const manifest = JSON.parse(
    await readFile(join(extensionDir, "package.json"), "utf8"),
  ) as Manifest;
  process.env.BLAST_SWEEP_SCRATCH = scratch;
  const bundled = JSON.parse(await readFile(bundlePath, "utf8")) as BundledCommand;
  const result = await launchOne(extension, manifest, command, bundled, clean);
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
