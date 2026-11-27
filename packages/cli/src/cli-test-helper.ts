import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The CLI is exercised as a real `node` child process: it must run without a
// build step under plain Node 24 and leave no processes or temp files behind.
export const cliPath = fileURLToPath(new URL("./cli.ts", import.meta.url));
export const nodePath = execFileSync("node", ["-p", "process.execPath"], {
  encoding: "utf8",
}).trim();
export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const helloList = join(root, "fixtures/extensions/hello-list");
export const hostSession = join(root, "fixtures/extensions/host-session");
export const hostApis = join(root, "fixtures/extensions/host-apis");
export const listExtras = join(root, "fixtures/extensions/list-extras");
export const gridFixture = join(root, "fixtures/extensions/grid");
export const storageFixture = join(root, "fixtures/extensions/storage");
export const launchFixture = join(root, "fixtures/extensions/launch");
export const actionsVariants = join(root, "fixtures/extensions/actions-variants");

export type CliResult = { code: number; stdout: string; stderr: string };

export function runCli(args: string[], script?: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(nodePath, [cliPath, ...args], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
    // "--script -" reads stdin; closing it always so the CLI can finish.
    child.stdin.end(script);
  });
}

export const FIRST_SCENE = `Navigation depth=1
  Navigation.Entry active=true
    List navigationTitle="hello-list" searchText="" [onSearchTextChange]
      List.Item "apple"
        Slot name="actions"
          ActionPanel
            Action.CopyToClipboard "Copy apple" [onAction]
            Action "Pin apple" [onAction]
      List.Item "banana"
        Slot name="actions"
          ActionPanel
            Action.CopyToClipboard "Copy banana" [onAction]
            Action "Pin banana" [onAction]
      List.Item "cherry"
        Slot name="actions"
          ActionPanel
            Action.CopyToClipboard "Copy cherry" [onAction]
            Action "Pin cherry" [onAction]
`;
