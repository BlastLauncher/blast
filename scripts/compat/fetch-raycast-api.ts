// Entry point for `bun run compat:fetch [version]`. It is the only place in the
// repo that touches the network: it reads the npm registry, downloads the
// release tarball, verifies it against the registry's Subresource Integrity
// digest, and only then vendors `types/index.d.ts` plus provenance into
// `compat/raycast-api/`. A failed check leaves `compat/` untouched.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  isRecord,
  PACKAGE_NAME,
  REGISTRY_URL,
  selectRelease,
  sha256Hex,
  verifyIntegrity,
} from "./raycast-api.ts";

const TYPES_MEMBER = "package/types/index.d.ts";
const MANIFEST_MEMBER = "package/package.json";

async function download(url: string, accept: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { accept } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function readLicense(extractDir: string): string {
  const manifest: unknown = JSON.parse(readFileSync(join(extractDir, MANIFEST_MEMBER), "utf8"));
  if (!isRecord(manifest) || typeof manifest.license !== "string" || manifest.license === "") {
    throw new Error(`${MANIFEST_MEMBER}: missing license`);
  }
  return manifest.license;
}

function extract(tarball: string, dest: string): void {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const result = spawnSync("tar", ["-xzf", tarball, "-C", dest, TYPES_MEMBER, MANIFEST_MEMBER]);
  if (result.status !== 0) {
    const detail = result.stderr?.toString().trim() ?? "";
    throw new Error(`tar failed to extract ${tarball} (status ${result.status}): ${detail}`);
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const metadata: unknown = JSON.parse(
    new TextDecoder().decode(await download(REGISTRY_URL, "application/json")),
  );
  const release = selectRelease(metadata, process.argv[2]);

  const cacheDir = join(root, ".cache", "raycast-api", release.version);
  mkdirSync(cacheDir, { recursive: true });
  const tarball = join(cacheDir, basename(new URL(release.tarball).pathname));
  const bytes = await download(release.tarball, "application/octet-stream");

  // Verify before anything is extracted or written under compat/.
  verifyIntegrity(bytes, release.integrity);
  writeFileSync(tarball, bytes);
  const extractDir = join(cacheDir, "extract");
  extract(tarball, extractDir);

  const types = readFileSync(join(extractDir, TYPES_MEMBER));
  const source = {
    package: PACKAGE_NAME,
    version: release.version,
    license: readLicense(extractDir),
    tarball: release.tarball,
    integrity: release.integrity,
    sha256: sha256Hex(types),
  };

  const outDir = join(root, "compat", "raycast-api");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.d.ts"), types);
  writeFileSync(join(outDir, "source.json"), `${JSON.stringify(source, null, 2)}\n`);

  console.log(`vendored ${PACKAGE_NAME}@${release.version} into compat/raycast-api`);
  console.log(`  ${types.byteLength} bytes, sha256 ${source.sha256}, license ${source.license}`);
}

await main();
