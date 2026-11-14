import { startWebLauncher } from "./server.ts";

if (process.argv.includes("--help") || process.argv.length < 3) {
  console.log("Usage: bun run example:web <extensionDir> [--port <port>]");
  process.exit(0);
}
const extensionDir = process.argv[2]!;
const portIndex = process.argv.indexOf("--port");
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 0;
const launcher = await startWebLauncher({
  extensionDir,
  ...(port ? { port } : {}),
});
console.log(launcher.url);
const stop = () => void launcher.close().finally(() => process.exit(0));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
