// Co-author with GPT-4
// https://chat.openai.com/share/963489f9-35f5-4253-bcbc-a67a8562a19e
import fs, { promises as fsPromises } from "fs";
import { IncomingMessage } from "http";
import https from "https";
import os from "os";
import path from "path";
import { pipeline } from "stream";
import { promisify } from "util";
import { createGunzip } from "zlib";

import fsExtra from "fs-extra";
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
    const dir = path.join(this.installPath, version)
    const binDir = path.join(dir, "bin")
    return fs.existsSync(dir) && fs.existsSync(binDir)
  }

  async download(version: string): Promise<void> {
    const url = this.getDownloadURL(version);
    const dest = path.join(this.installPath, version);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const tempDir = temporaryDirectory();
    const targetDir = path.join(this.installPath, version);
    const downloadTempPath = path.join(tempDir, "node.tar.gz");

    const response: IncomingMessage = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error("Failed to download Node.js"));
        } else {
          resolve(res);
        }
      });
    });

    await pipelineAsync(response, createGunzip(), fs.createWriteStream(downloadTempPath));

    await tar.x({
      file: downloadTempPath,
      cwd: tempDir,
    });

    // Get the directory created by tar extraction
    const [extractedDir] = await fsPromises.readdir(tempDir);
    const extractedDirPath = path.join(tempDir, extractedDir);

    // Check if it's actually a directory
    const stats = await fsPromises.stat(extractedDirPath);
    if (!stats.isDirectory()) {
      throw new Error("Expected a directory in the extracted content");
    }

    // cp extractedDirPath as targetDir
    fsExtra.ensureDirSync(targetDir); 

    await fsPromises.cp(extractedDirPath, targetDir, { recursive: true });
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
      const aVersion = a
        .replace("v", "")
        .split(".")
        .map((v) => parseInt(v, 10));
      const bVersion = b
        .replace("v", "")
        .split(".")
        .map((v) => parseInt(v, 10));

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
