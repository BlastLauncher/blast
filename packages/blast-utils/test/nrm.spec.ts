import fs, { promises as fsPromises } from "fs";
import { ClientRequest, IncomingMessage } from "http";
import https from "https";
import os from "os";
import path from "path";
import { PassThrough } from "stream";

import tar from "tar";

import { NRM } from "../src/nrm";
import { temporaryDirectory } from "../src/nrm/utils";

const version = "v18.17.1";
const archiveDirectory = `node-${version}-${process.platform}-${process.arch}`;

async function createNodeArchive(): Promise<Buffer> {
  const fixtureDirectory = await fsPromises.mkdtemp(path.join(os.tmpdir(), "blast-nrm-fixture-"));
  const nodeDirectory = path.join(fixtureDirectory, archiveDirectory);
  const binDirectory = path.join(nodeDirectory, "bin");
  const archivePath = path.join(fixtureDirectory, "node.tar.gz");

  await fsPromises.mkdir(binDirectory, { recursive: true });
  await fsPromises.writeFile(path.join(binDirectory, "node"), "node fixture");
  await fsPromises.writeFile(path.join(binDirectory, "npm"), "npm fixture");
  await tar.c({ cwd: fixtureDirectory, file: archivePath, gzip: true }, [archiveDirectory]);

  const archive = await fsPromises.readFile(archivePath);
  await fsPromises.rm(fixtureDirectory, { recursive: true, force: true });
  return archive;
}

function mockNodeDownload(archive: Buffer): void {
  jest.spyOn(https, "get").mockImplementation(((url: string, callback: (response: IncomingMessage) => void) => {
    void url;
    const response = new PassThrough() as PassThrough & { statusCode: number };
    response.statusCode = 200;
    callback(response as unknown as IncomingMessage);
    response.end(archive);
    return new PassThrough() as unknown as ClientRequest;
  }) as typeof https.get);
}

describe("NRM", function () {
  let archive: Buffer;

  beforeAll(async function () {
    archive = await createNodeArchive();
  });

  afterEach(function () {
    jest.restoreAllMocks();
  });

  it("downloads and installs a node binary", async function () {
    const directory = temporaryDirectory();
    const nrm = new NRM({ installPath: directory });

    try {
      mockNodeDownload(archive);
      await nrm.download(version);

      const nodePath = nrm.nodePath;
      const npmPath = nrm.npmPath;

      expect(nodePath).toContain(version);
      expect(npmPath).toContain(version);
      expect(nodePath).toContain(directory);
      expect(npmPath).toContain(directory);
      expect(fs.existsSync(nodePath)).toBe(true);
      expect(fs.existsSync(npmPath)).toBe(true);
    } finally {
      await fsPromises.rm(directory, { recursive: true, force: true });
    }
  });

  it("uninstalls a node binary", async function () {
    const directory = temporaryDirectory();
    const nrm = new NRM({ installPath: directory });

    try {
      mockNodeDownload(archive);
      await nrm.download(version);
      const nodePath = nrm.nodePath;
      const npmPath = nrm.npmPath;

      await nrm.uninstall(version);

      expect(fs.existsSync(nodePath)).toBe(false);
      expect(fs.existsSync(npmPath)).toBe(false);
    } finally {
      await fsPromises.rm(directory, { recursive: true, force: true });
    }
  });

  it("lists versions sorted", async function () {
    const directory = temporaryDirectory();
    const nrm = new NRM({ installPath: directory });

    try {
      const versionsToCreate = ["v14.15.0", "v16.0.0", "v18.17.1"];

      for (const version of versionsToCreate) {
        const versionDir = path.join(directory, version);
        fs.mkdirSync(versionDir, { recursive: true });
      }

      const versions = nrm.listVersions();
      expect(versions).toEqual(["v18.17.1", "v16.0.0", "v14.15.0"]);
    } finally {
      await fsPromises.rm(directory, { recursive: true, force: true });
    }
  });
});
