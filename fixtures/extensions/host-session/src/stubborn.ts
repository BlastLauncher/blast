import { Clipboard } from "@raycast/api";
export default async function command() {
  process.stdin.removeAllListeners("data");
  process.on("SIGTERM", () => {});
  void Clipboard.copy("started");
  await new Promise(() => {});
}
