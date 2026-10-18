import { MenuBarExtra } from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [title, setTitle] = useState("Ready");
  return (
    <MenuBarExtra title={title}>
      <MenuBarExtra.Section title="Tools">
        <MenuBarExtra.Submenu title="More">
          <MenuBarExtra.Item title="Click" onAction={(event) => setTitle(event.type)} />
        </MenuBarExtra.Submenu>
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
