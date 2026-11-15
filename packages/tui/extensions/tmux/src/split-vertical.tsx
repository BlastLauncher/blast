import { targeted } from "./tmux.ts";

export default async function Command() {
  await targeted("split-window", ["-v", "-c", "#{pane_current_path}"]);
}
