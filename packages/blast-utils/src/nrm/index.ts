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
export class NRM {
  private os: OperatingSystem;
  private installPath: string;

  constructor(options?: NRMOptions) {
    this.os = detectOS();
    this.installPath = options?.installPath || path.join(os.homedir(), ".blast/nodejs");
  }

  async download(version: string): Promise<void> {
    const url = this.getDownloadURL(version);
    const dest = path.join(this.installPath, version);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const tempDir = temporaryDirectory();
    const extractDir = temporaryDirectory();
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
              cwd: extractDir,
            })
            .then(() => {
              // Move the extracted folder to the destination
              // find the only folder in the extractDir
              const extractedFolder = fs.readdirSync(extractDir).pop();

              if (!extractedFolder) {
                throw new Error("Failed to extract Node.js");
              }

              fs.renameSync(path.join(extractDir, extractedFolder), targetDir);
              resolve();
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .catch((err: any) => {
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
    // The active version logic can be based on a symbolic link or a configuration file.
    // For simplicity, let's say the last version downloaded is the active one.
    const activeVersion = fs.readdirSync(this.installPath).pop();
    if (!activeVersion) {
      throw new Error("No version of Node.js installed");
    }
    return path.join(this.installPath, activeVersion, "bin", "node");
  }

  get npmPath(): string {
    const activeVersion = fs.readdirSync(this.installPath).pop();
    if (!activeVersion) {
      throw new Error("No version of Node.js installed");
    }
    return path.join(this.installPath, activeVersion, "bin", "npm");
  }

  private getDownloadURL(version: string): string {
    const arch = process.arch;
    return `https://nodejs.org/dist/${version}/node-${version}-${this.os}-${arch}.tar.gz`;
  }
}
