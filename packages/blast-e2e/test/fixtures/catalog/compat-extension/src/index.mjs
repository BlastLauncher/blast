// Immutable fixture command written against the Raycast compatibility surface.
import { createElement } from "react";

import { Action, ActionPanel, Icon, List, runCommand } from "@blastlauncher/raycast-compat";

export function command(context) {
  runCommand(context, () =>
    createElement(
      List,
      { navigationTitle: "Compat" },
      createElement(
        List.Item,
        { title: "Hello", subtitle: "World", icon: Icon.Circle },
        createElement(
          ActionPanel,
          null,
          createElement(Action.CopyToClipboard, { title: "Copy", content: "from-compat" }),
        ),
      ),
    ),
  );
}
