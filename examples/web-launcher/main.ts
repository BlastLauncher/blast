import { startWebLauncher } from "./server.ts";

if (process.argv.includes("--help") || process.argv.length < 3) {
  console.log("Usage: bun run example:web <extensionDir> [command] [--port <port>]");
  process.exit(0);
}
const extensionDir = process.argv[2]!;
const command = process.argv.find(
  (value, index) => index > 2 && value !== "--port" && process.argv[index - 1] !== "--port",
);
const portIndex = process.argv.indexOf("--port");
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 0;
const launcher = await startWebLauncher({
  extensionDir,
  ...(command ? { command } : {}),
  ...(port ? { port } : {}),
});
console.log(launcher.url);
const stop = () => void launcher.close().finally(() => process.exit(0));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
