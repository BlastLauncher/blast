import fs from 'fs';
import os from 'os';
import path from 'path';

import { OperatingSystem } from "./types";

export function detectOS(): OperatingSystem {
  const platform = process.platform;
  
  switch (platform) {
    case "darwin":
    case "linux":
      return platform;
    default:
      throw new Error("Unsupported OS");
  }
}

/**
 * Creates a unique temporary directory and returns its path.
 * 
 * @param prefix - Optional prefix for the temporary directory name.
 * @returns Path to the created temporary directory.
 */
export function temporaryDirectory(prefix = 'temp'): string {
  const baseTempDir = os.tmpdir();
  let tempDirPath: string;

  for(;;) {
    tempDirPath = path.join(baseTempDir, `${prefix}-${Math.random().toString(36).substr(2, 9)}`);
    if (!fs.existsSync(tempDirPath)) {
      break;
    }
  }

  fs.mkdirSync(tempDirPath);
  return tempDirPath;
}
