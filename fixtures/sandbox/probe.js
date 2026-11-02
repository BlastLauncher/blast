import { readFile, writeFile } from "node:fs/promises";
import net from "node:net";

const [denied, outside, scratch] = process.argv.slice(2);
const attempt = async (work) => {
  try {
    await work();
    return "allowed";
  } catch (error) {
    return error?.code ?? error?.message ?? String(error);
  }
};
const network = await new Promise((resolve) => {
  const socket = net.createConnection({ host: "127.0.0.1", port: 9 });
  socket.once("connect", () => {
    socket.destroy();
    resolve("connected");
  });
  socket.once("error", (error) => resolve(error?.code ?? error?.message ?? String(error)));
});
console.log(
  JSON.stringify({
    deniedRead: await attempt(() => readFile(denied, "utf8")),
    network,
    outsideWrite: await attempt(() => writeFile(outside, "outside")),
    scratchWrite: await attempt(() => writeFile(`${scratch}/inside`, "inside")),
    env: Object.keys(process.env).toSorted(),
  }),
);
