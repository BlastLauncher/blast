import { ChildProcess, spawn } from "child_process";
import path from "path";

import fs from "fs-extra";


import { nrm } from "./nrm";
import { logDir } from "./utils/commonPaths";

let runtimeProcess: ChildProcess | undefined;

// const logPath = path.join(logDir, "runtime.log");
const errPath = path.join(logDir, "runtime.err.log");

const getRuntimePath = (): string => {
  if (process.env.NODE_ENV === "development") {
    return require.resolve("@blastlauncher/runtime/dist/run.cjs");
  } else {
    return path.join(process.resourcesPath, "run.cjs");
  }
};

export const startRuntime = async () => {
  const modulePath = getRuntimePath();
  const runtimePath = nrm.nodePath;

  console.log("runtimePath", runtimePath);
  console.log("modulePath", modulePath);

  const errStream = fs.createWriteStream(errPath, { flags: "a" });

  runtimeProcess = spawn(runtimePath, [modulePath], {
    env: process.env,
    stdio: 'inherit'
  });

  runtimeProcess.stderr?.pipe(errStream);

  runtimeProcess.on("close", (code) => {
    console.log(`Runtime process exited with code ${code}`);
  });
};

export const stopRuntime = (): void => {
  runtimeProcess?.kill();
  runtimeProcess = undefined;
};

// TODO: more process management
export const restartRuntime = () => {
  stopRuntime();
  startRuntime();
}

