import { List } from "@raycast/api";
import { createScriptCommandDeeplink } from "@raycast/utils";
import { basename } from "node:path";
import { useState } from "react";
import { label } from "./label";

export default function Command() {
  const [command] = useState(basename("fixtures/shared-utils"));
  return (
    <List navigationTitle="shared-utils">
      <List.Item title={label(createScriptCommandDeeplink({ command }))} />
    </List>
  );
}
