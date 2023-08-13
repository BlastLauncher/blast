import { ChildProcess, spawn } from "child_process";
import path from "path";

import { nrm } from "./nrm";

let runtimeProcess: ChildProcess | undefined;

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

  runtimeProcess = spawn(runtimePath, [modulePath], {
    stdio: "ignore",
    env: process.env,
  });
};

export const stopRuntime = (): void => {
  runtimeProcess?.kill();
};

// TODO: more process management
