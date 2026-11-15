import { targeted } from "./tmux.ts";

export default async function Command() {
  await targeted("new-window", ["-c", "#{pane_current_path}"]);
}
