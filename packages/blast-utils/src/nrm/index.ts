// Co-author with GPT-4
// https://chat.openai.com/share/963489f9-35f5-4253-bcbc-a67a8562a19e
import fs, { promises as fsPromises } from "fs";
import https from "https";
import os from "os";
import path from "path";
import { pipeline } from "stream";
import { promisify } from "util";
import { createGunzip } from "zlib";

import tar from "tar";

import { OperatingSystem, NRMOptions } from "./types";
import { detectOS, temporaryDirectory } from "./utils";

const pipelineAsync = promisify(pipeline);
// NRM stands for Node.js Runtime Manager
export class NRM {
  private os: OperatingSystem;
  private installPath: string;

  constructor(options?: NRMOptions) {
    this.os = detectOS();
    this.installPath = options?.installPath || path.join(os.homedir(), ".blast/nodejs");
  }

  hasVersion(version: string): boolean {
    return fs.existsSync(path.join(this.installPath, version));
  }

  async download(version: string): Promise<void> {
    const url = this.getDownloadURL(version);
    const dest = path.join(this.installPath, version);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const tempDir = temporaryDirectory();
    const targetDir = path.join(this.installPath, version);

    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error("Failed to download Node.js"));
          return;
        }

        const downloadTempPath = path.join(tempDir, "node.tar.gz");
        const writeStream = fs.createWriteStream(downloadTempPath);
        pipelineAsync(response, createGunzip(), writeStream).then(() =>
          tar
            .x({
              file: downloadTempPath,
              cwd: targetDir,
              path: this.getFileName(version),
            }).then(() => {
              resolve();
            })
            .catch((err) => {
              reject(err);
            })
        );
      });
    });
  }

  /**
   * Uninstalls (removes) a specific version of Node.js.
   *
   * @param version - The version of Node.js to uninstall.
   * @returns Promise indicating completion.
   */
  async uninstall(version: string): Promise<void> {
    const versionDir = path.join(this.installPath, version);

    // Check if the version exists
    if (!fs.existsSync(versionDir)) {
      throw new Error(`Version ${version} is not installed.`);
    }

    // Remove the version directory
    await fsPromises.rmdir(versionDir, { recursive: true });
  }

  get nodePath(): string {
    const versions = this.listVersions();
    const activeVersion = versions[0];
    if (!activeVersion) {
      throw new Error("No version of Node.js installed");
    }
    return path.join(this.installPath, activeVersion, "bin", "node");
  }

  get npmPath(): string {
    const versions = this.listVersions();
    const activeVersion = versions[0];
    if (!activeVersion) {
      throw new Error("No version of Node.js installed");
    }
    return path.join(this.installPath, activeVersion, "bin", "npm");
  }

  listVersions(): string[] {
    // sort the version by descending order
    // version name is in the format of v14.15.0
    return fs.readdirSync(this.installPath).sort((a, b) => {
      const aVersion = a.replace("v", "").split(".").map((v) => parseInt(v, 10));
      const bVersion = b.replace("v", "").split(".").map((v) => parseInt(v, 10));

      for (let i = 0; i < aVersion.length; i++) {
        if (aVersion[i] > bVersion[i]) {
          return -1;
        } else if (aVersion[i] < bVersion[i]) {
          return 1;
        }
      }
      return 0;
    });
  }

  private getFileName(version: string): string {
    const arch = process.arch;
    return `node-${version}-${this.os}-${arch}`;
  }

  private getDownloadURL(version: string): string {
    const arch = process.arch;
    return `https://nodejs.org/dist/${version}/${this.getFileName(version)}.tar.gz`;
  }
}
