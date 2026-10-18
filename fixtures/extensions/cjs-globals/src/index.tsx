import { List } from "@raycast/api";

// Written against Raycast's CommonJS-style contract: `__filename`, `__dirname`
// and `require` come from the bundler, not from an import. Blast's ESM bundle
// must define them (banner in packages/host/src/bundle.ts).
const path = require("node:path");

export default function Command() {
  return (
    <List navigationTitle={path.basename(__filename)}>
      <List.Item title={path.join(__dirname, "assets")} />
    </List>
  );
}
