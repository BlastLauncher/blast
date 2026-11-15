import { reloadConfig } from "./tmux.ts";

export default async function Command() {
  await reloadConfig();
}
