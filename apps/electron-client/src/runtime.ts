import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

import fs from "fs-extra";

import { nrm } from "./nrm";
import { logDir } from "./utils/commonPaths";

let runtimeProcess: ChildProcess | undefined;

const logPath = path.join(logDir, "runtime.log");
const errPath = path.join(logDir, "runtime.err.log");
const pidPath = path.join(logDir, "runtime.pid");

function pidIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

const getRuntimePath = (): string => {
  if (process.env.NODE_ENV === "development") {
    return require.resolve("@blastlauncher/runtime/dist/run.cjs");
  }

  return path.join(process.resourcesPath, "run.cjs");
};

const checkAndCloseExistingRuntime = (): void => {
  if (fs.existsSync(pidPath)) {
    const pid = fs.readFileSync(pidPath, "utf-8");
    if (pidIsRunning(Number.parseInt(pid))) {
      console.log("Killing existing runtime process", pid);

      try {
        process.kill(Number.parseInt(pid));
      } catch (e) {
        console.log("Failed to kill runtime process", e);
      }
    }
    fs.unlinkSync(pidPath);
  }
};

export const startRuntime = async () => {
  checkAndCloseExistingRuntime();

  const modulePath = getRuntimePath();
  const runtimePath = nrm.nodePath;

  const binPath = nrm.binPath;

  const errStream = fs.createWriteStream(errPath, { flags: "a" });
  const stdStream = fs.createWriteStream(logPath, { flags: "a" });

  runtimeProcess = spawn(runtimePath, [modulePath, '--host', 'localhost', '--port', '8763'], {
    env: {
      ...process.env,
      PATH: `${binPath}:${process.env.PATH}`,
    },
  });

  fs.writeFileSync(pidPath, runtimeProcess.pid.toString());

  runtimeProcess.stdout?.pipe(stdStream);
  runtimeProcess.stderr?.pipe(errStream);

  runtimeProcess.on("close", (code) => {
    console.log(`Runtime process exited with code ${code}`);
  });
};

export const stopRuntime = (): void => {
  if (!runtimeProcess) {
    return;
  }

  checkAndCloseExistingRuntime();
  runtimeProcess = undefined;
};

// TODO: more process management
export const restartRuntime = () => {
  stopRuntime();
  startRuntime();
};
