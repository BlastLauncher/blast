import fs from "fs";

import { NRM } from "../src/nrm";
import { temporaryDirectory } from "../src/nrm/utils";

// Downloading and extracting Node.js binaries can take a while on CI
// so bump the default Jest timeout for this suite.
// Node.js archives may take some time to download in CI, so allow
// up to two minutes for each test before timing out.
jest.setTimeout(120000);

const version = "v18.17.1";

describe.skip("Test nrm#download", function () {
  it("download and install node binary", async function () {
    const directory = temporaryDirectory();
    const nrm = new NRM({ installPath: directory });

    await nrm.download(version);

    const nodePath = nrm.nodePath;
    const npmPath = nrm.npmPath;

    expect(nodePath).toContain(version);
    expect(npmPath).toContain(version);

    expect(nodePath).toContain(directory);
    expect(npmPath).toContain(directory);

    expect(fs.existsSync(nodePath)).toBe(true);
    expect(fs.existsSync(npmPath)).toBe(true);
  });
});

describe.skip("Test nrm#uninstall", function () {
  it("uninstall node binary", async function () {
    const directory = temporaryDirectory();
    const nrm = new NRM({ installPath: directory });

    await nrm.download(version);
    const nodePath = nrm.nodePath;
    const npmPath = nrm.npmPath;

    await nrm.uninstall(version);

    expect(fs.existsSync(nodePath)).toBe(false);
    expect(fs.existsSync(npmPath)).toBe(false);
  });
})

describe("Test nrm#listVersions", function () {
  it("list versions sorted", async function () {
    const directory = temporaryDirectory();
    const nrm = new NRM({ installPath: directory });

    // create fake node versions directories
    const versionsToCreate = ["v14.15.0", "v16.0.0", "v18.17.1"];

    for (const version of versionsToCreate) {
      const versionDir = directory + "/" + version;
      fs.mkdirSync(versionDir, { recursive: true });
    }

    const versions = nrm.listVersions();
    expect(versions).toEqual(["v18.17.1", "v16.0.0", "v14.15.0"]);
  });
});
