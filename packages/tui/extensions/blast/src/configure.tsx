import { useState } from "react";
import { Action, ActionPanel, Form, showHUD } from "@raycast/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const themes = ["system", "dark", "light", "mono"] as const;
type Theme = (typeof themes)[number];

export default function ConfigureBlast() {
  const [theme, setTheme] = useState<Theme>((process.env.BLAST_THEME as Theme) ?? "system");
  return (
    <Form
      navigationTitle="Configure Blast"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Configuration"
            onSubmit={async (values: { theme?: string }) => {
              const next = themes.includes(values.theme as Theme) ? (values.theme as Theme) : theme;
              await run("tmux", ["set-option", "-g", "@blast-theme", next]);
              await showHUD(`Blast theme set to ${next}`);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="theme"
        title="Theme"
        value={theme}
        onChange={(value) => setTheme(value as Theme)}
      >
        <Form.Dropdown.Item value="system" title="System Appearance" />
        <Form.Dropdown.Item value="dark" title="Dark" />
        <Form.Dropdown.Item value="light" title="Light" />
        <Form.Dropdown.Item value="mono" title="Monochrome" />
      </Form.Dropdown>
    </Form>
  );
}
