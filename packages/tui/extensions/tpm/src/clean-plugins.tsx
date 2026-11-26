import { Alert, closeMainWindow, confirmAlert } from "@raycast/api";
import { runTpmNoView } from "./tpm.ts";

export default async function Command() {
  const confirmed = await confirmAlert({
    title: "Clean unused TPM plugins?",
    message: "Plugins not declared in your tmux configuration will be removed from disk.",
    primaryAction: { title: "Clean Plugins", style: Alert.ActionStyle.Destructive },
  });
  if (!confirmed) {
    await closeMainWindow();
    return;
  }
  await runTpmNoView({
    script: "clean_plugins",
    loadingTitle: "Cleaning unused TPM plugins…",
    successTitle: "Cleaned TPM plugins",
  });
}
