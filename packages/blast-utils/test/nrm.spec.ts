import fs from "fs";

import { NRM } from "../src/nrm";
import { temporaryDirectory } from "../src/nrm/utils";

const version = "v18.17.1";

describe("Test nrm", function () {
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
