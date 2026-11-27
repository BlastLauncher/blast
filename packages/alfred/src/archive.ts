// `.alfredworkflow` files are ZIP archives from untrusted sources. This is a
// small reader for the subset real workflows use (stored and deflate, no
// encryption, no ZIP64) that rejects anything that could escape the
// extraction directory or exhaust memory, plus a content-addressed,
// atomically published extraction cache.

import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  /** Normalised path with `/` separators; directories end with `/`. */
  name: string;
  isDirectory: boolean;
  /** 0 = stored, 8 = deflate. */
  method: number;
  compressedSize: number;
  size: number;
  crc32: number;
  /** POSIX permission bits from the external attributes, or 0 when absent. */
  mode: number;
  /** Decompresses the entry and verifies its size and CRC-32. */
  read(): Uint8Array;
}

export interface ExtractOptions {
  maxTotalBytes?: number;
  maxEntries?: number;
}

export const DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
export const DEFAULT_MAX_ENTRIES = 10_000;
export const EXTRACTED_MARKER = ".blast-extracted";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_SIZE = 22;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const S_IFDIR = 0o040000;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(view: DataView): number {
  const last = view.byteLength - EOCD_SIZE;
  // The trailing comment is at most 65535 bytes, so the record is within reach.
  const first = Math.max(0, last - 0xffff);
  for (let at = last; at >= first; at--) {
    if (
      view.getUint32(at, true) === EOCD_SIGNATURE &&
      at + EOCD_SIZE + view.getUint16(at + 20, true) <= view.byteLength
    ) {
      return at;
    }
  }
  throw new Error("zip: end of central directory not found (not a ZIP archive?)");
}

// Rejects anything that is not a plain relative path inside the archive root.
function checkEntryName(name: string): void {
  const shown = JSON.stringify(name);
  if (name === "") throw new Error("zip: entry has an empty name");
  if (name.includes("\0")) throw new Error(`zip: entry name ${shown} contains a NUL byte`);
  if (name.includes("\\")) throw new Error(`zip: entry name ${shown} contains a backslash`);
  if (name.startsWith("/")) throw new Error(`zip: entry name ${shown} is absolute`);
  if (/^[A-Za-z]:/.test(name)) throw new Error(`zip: entry name ${shown} has a drive prefix`);
  const segments = name.endsWith("/") ? name.slice(0, -1).split("/") : name.split("/");
  for (const segment of segments) {
    if (segment === "..") throw new Error(`zip: entry name ${shown} escapes the archive root`);
    if (segment === "" || segment === ".")
      throw new Error(`zip: entry name ${shown} has an empty or "." segment`);
  }
}

export function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  if (bytes.length < EOCD_SIZE) throw new Error("zip: file is too short to be a ZIP archive");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  const disk = view.getUint16(eocd + 4, true);
  const cdDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const totalEntries = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || cdDisk !== 0 || diskEntries !== totalEntries) {
    throw new Error("zip: multi-disk archives are not supported");
  }
  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error("zip: ZIP64 archives are not supported");
  }
  if (cdOffset + cdSize > eocd) throw new Error("zip: central directory lies outside the file");

  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let at = cdOffset;
  for (let index = 0; index < totalEntries; index++) {
    if (at + CENTRAL_SIZE > cdOffset + cdSize || view.getUint32(at, true) !== CENTRAL_SIGNATURE) {
      throw new Error(`zip: central directory entry ${index} is corrupt`);
    }
    const madeBy = view.getUint16(at + 4, true) >> 8;
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const externalAttr = view.getUint32(at + 38, true);
    const localOffset = view.getUint32(at + 42, true);
    const nameEnd = at + CENTRAL_SIZE + nameLength;
    if (nameEnd > cdOffset + cdSize)
      throw new Error(`zip: central directory entry ${index} is truncated`);
    const rawName = bytes.subarray(at + CENTRAL_SIZE, nameEnd);
    const name = decoder.decode(rawName);
    at = nameEnd + extraLength + commentLength;

    checkEntryName(name);
    const shown = JSON.stringify(name);
    if (seen.has(name)) throw new Error(`zip: duplicate entry ${shown}`);
    seen.add(name);
    if (flags & 0x41) throw new Error(`zip: entry ${shown} is encrypted`);
    if (method !== 0 && method !== 8)
      throw new Error(`zip: entry ${shown} uses unsupported compression method ${method}`);
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("zip: ZIP64 archives are not supported");
    }
    // Only Unix-made (3) and macOS-made (19) entries carry a POSIX mode in the
    // high 16 bits. Symlinks are rejected whatever the host claims to be.
    if (((externalAttr >>> 16) & S_IFMT) === S_IFLNK)
      throw new Error(`zip: entry ${shown} is a symbolic link`);
    const unixMode = madeBy === 3 || madeBy === 19 ? externalAttr >>> 16 : 0;
    const isDirectory = name.endsWith("/") || (unixMode & S_IFMT) === S_IFDIR;
    if (method === 0 && compressedSize !== size)
      throw new Error(`zip: stored entry ${shown} has mismatched sizes`);

    if (
      localOffset + LOCAL_SIZE > cdOffset ||
      view.getUint32(localOffset, true) !== LOCAL_SIGNATURE
    ) {
      throw new Error(`zip: local header for ${shown} is missing`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localName = bytes.subarray(
      localOffset + LOCAL_SIZE,
      localOffset + LOCAL_SIZE + localNameLength,
    );
    if (!sameBytes(localName, rawName))
      throw new Error(`zip: local header name differs for ${shown}`);
    const dataStart = localOffset + LOCAL_SIZE + localNameLength + localExtraLength;
    if (dataStart + compressedSize > cdOffset)
      throw new Error(`zip: data for ${shown} runs past the central directory`);

    entries.push({
      name: isDirectory && !name.endsWith("/") ? `${name}/` : name,
      isDirectory,
      method,
      compressedSize,
      size,
      crc32: crc,
      mode: unixMode & 0o7777,
      read() {
        const raw = bytes.subarray(dataStart, dataStart + compressedSize);
        let data: Uint8Array;
        if (method === 0) {
          data = new Uint8Array(raw);
        } else {
          try {
            // Cap output at the declared size so a lying header cannot inflate past it.
            data = new Uint8Array(inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) }));
          } catch (error) {
            throw new Error(`zip: cannot inflate ${shown}: ${(error as Error).message}`, {
              cause: error,
            });
          }
        }
        if (data.length !== size)
          throw new Error(`zip: ${shown} is ${data.length} bytes, expected ${size}`);
        if (crc32(data) !== crc) throw new Error(`zip: CRC-32 mismatch for ${shown}`);
        return data;
      },
    });
  }
  return entries;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts a workflow archive into `<cacheRoot>/<sha256-16>/`. The directory
 * only ever appears complete: entries are written to a temporary sibling that
 * is renamed into place after the completion marker is written, so a crash
 * leaves at most a stray temp directory and concurrent callers converge.
 */
export async function extractWorkflowArchive(
  archivePath: string,
  cacheRoot: string,
  options: ExtractOptions = {},
): Promise<{ dir: string; extracted: boolean }> {
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const bytes = await readFile(archivePath);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const dir = join(cacheRoot, hash);
  if (await exists(join(dir, EXTRACTED_MARKER))) return { dir, extracted: false };

  const all = readZipEntries(bytes);
  if (all.length > maxEntries)
    throw new Error(`zip: archive has ${all.length} entries, limit is ${maxEntries}`);
  // macOS Archive Utility adds resource-fork shadows under __MACOSX/.
  const entries = all.filter((entry) => !entry.name.startsWith("__MACOSX/"));
  let total = 0;
  for (const entry of entries) {
    if (entry.name.split("/")[0] === EXTRACTED_MARKER) {
      throw new Error(
        `zip: entry ${JSON.stringify(entry.name)} collides with the extraction marker`,
      );
    }
    total += entry.size;
    if (total > maxTotalBytes)
      throw new Error(`zip: archive expands past the ${maxTotalBytes}-byte limit`);
  }

  await mkdir(cacheRoot, { recursive: true });
  const temp = await mkdtemp(join(cacheRoot, `.${hash}-`));
  try {
    for (const entry of entries) {
      const target = join(temp, ...entry.name.split("/").filter(Boolean));
      if (entry.isDirectory) {
        await mkdir(target, { recursive: true });
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, entry.read(), { flag: "wx" });
      // Keep execute bits so `scriptfile` objects stay runnable; drop
      // setuid/setgid/sticky and always keep the owner able to read and write.
      if (entry.mode & 0o111) await chmod(target, (entry.mode & 0o777) | 0o600);
    }
    await writeFile(join(temp, EXTRACTED_MARKER), `${hash}\n`);
    await publish(temp, dir);
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    if (isTakenError(error) && (await exists(join(dir, EXTRACTED_MARKER)))) {
      return { dir, extracted: false };
    }
    throw error;
  }
  return { dir, extracted: true };
}

function isTakenError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EEXIST" || code === "ENOTEMPTY";
}

async function publish(temp: string, dir: string): Promise<void> {
  try {
    await rename(temp, dir);
  } catch (error) {
    // Lost a race to another extractor, or `dir` is a leftover without a
    // marker. Only the latter is ours to replace.
    if (!isTakenError(error) || (await exists(join(dir, EXTRACTED_MARKER)))) throw error;
    await rm(dir, { recursive: true, force: true });
    await rename(temp, dir);
  }
}
