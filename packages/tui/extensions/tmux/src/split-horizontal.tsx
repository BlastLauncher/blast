import { targeted } from "./tmux.ts";

export default async function Command() {
  await targeted("split-window", ["-h", "-c", "#{pane_current_path}"]);
}
