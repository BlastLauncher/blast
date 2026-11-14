import { environment, List } from "@raycast/api";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// What the sandbox must hold before a command runs: its assets (binary ones
// byte for byte) and its package.json one level above the bundle, where
// bundled dependencies look for it.
const nested = JSON.parse(readFileSync(join(environment.assetsPath, "nested/data.json"), "utf8"));
const bytes = Array.from(readFileSync(join(environment.assetsPath, "bytes.bin"))).join(",");
const manifest = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

export default function Command() {
  return (
    <List>
      <List.Item id="json" title={nested.message} />
      <List.Item id="bytes" title={`bytes ${bytes}`} />
      <List.Item id="manifest" title={`manifest ${manifest.name}`} />
    </List>
  );
}
