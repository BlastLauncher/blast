import { targetedWindow } from "./tmux.ts";

export default async function Command() {
  await targetedWindow("new-window", ["-c", "#{pane_current_path}"]);
}
