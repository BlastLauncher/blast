import { Icon, MenuBarExtra } from "@raycast/api";

export default function Command() {
  return (
    <MenuBarExtra title="Blast" tooltip="Blast menu" icon={Icon.Circle}>
      <MenuBarExtra.Section title="Actions">
        <MenuBarExtra.Item title="Refresh" icon={Icon.Star} onAction={() => undefined} />
        <MenuBarExtra.Submenu title="More" icon={Icon.Star}>
          <MenuBarExtra.Item title="Settings" onAction={() => undefined} />
        </MenuBarExtra.Submenu>
      </MenuBarExtra.Section>
      <MenuBarExtra.Separator />
      <MenuBarExtra.Item title="Disabled item" />
    </MenuBarExtra>
  );
}
