import { environment, List } from "@raycast/api";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Both Raycast asset access styles must resolve to the extension's real
// assets: the host-supplied environment path and the bundle-relative
// `__dirname`. Neither may land in a build directory without the layout.
const viaEnvironment = readFileSync(join(environment.assetsPath!, "message.txt"), "utf8").trim();
const viaDirname = readFileSync(join(__dirname, "assets", "message.txt"), "utf8").trim();

export default function Command() {
  return (
    <List navigationTitle="assets">
      <List.Item title={viaEnvironment} subtitle={viaDirname} />
    </List>
  );
}
