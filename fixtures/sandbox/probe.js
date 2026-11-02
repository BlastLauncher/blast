import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";

const [denied, outside, scratch, portText] = process.argv.slice(2);
const port = Number(portText);

const attempt = async (work) => {
  try {
    await work();
    return "allowed";
  } catch (error) {
    return error?.code ?? error?.message ?? String(error);
  }
};

const network = await new Promise((resolve) => {
  const socket = net.createConnection({ host: "127.0.0.1", port });
  socket.once("connect", () => {
    socket.destroy();
    resolve("connected");
  });
  socket.once("error", (error) => resolve(error?.code ?? error?.message ?? String(error)));
});

const exec = async (command, args) =>
  await new Promise((resolve) => {
    try {
      const child = spawn(command, args, { stdio: "ignore" });
      child.once("error", (error) => resolve(error?.code ?? error?.message ?? String(error)));
      child.once("close", (code, signal) => resolve(`exit:${signal ?? code}`));
    } catch (error) {
      resolve(error?.code ?? error?.message ?? String(error));
    }
  });

console.log(
  JSON.stringify({
    deniedRead: await attempt(() => readFile(denied, "utf8")),
    network,
    outsideWrite: await attempt(() => writeFile(outside, "outside")),
    scratchWrite: await attempt(() => writeFile(`${scratch}/inside`, "inside")),
    devNullWrite: await attempt(() => writeFile("/dev/null", "null")),
    exec: await exec("/usr/bin/true", []),
    env: Object.keys(process.env).toSorted(),
  }),
);
