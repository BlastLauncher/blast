import { runTpmNoView } from "./tpm.ts";

export default async function Command() {
  await runTpmNoView({
    script: "install_plugins",
    loadingTitle: "Installing TPM plugins…",
    successTitle: "Installed TPM plugins",
  });
}
