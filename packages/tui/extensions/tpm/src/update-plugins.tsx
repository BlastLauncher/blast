import { runTpmNoView } from "./tpm.ts";

export default async function Command() {
  await runTpmNoView({
    script: "update_plugins",
    args: ["all"],
    loadingTitle: "Updating all TPM plugins…",
    successTitle: "Updated TPM plugins",
  });
}
