import { NRM } from "@blastlauncher/utils";

import { NODE_INSTALL_PATH } from "./constants";
import { MANAGED_NODE_VERSION } from "./nodeRuntimeVersion";

export { MANAGED_NODE_VERSION };

export const nrm = new NRM({
  installPath: NODE_INSTALL_PATH,
});

export function hasVersionInstalled() {
  return nrm.hasVersion(MANAGED_NODE_VERSION);
}

export function installNode() {
  return nrm.download(MANAGED_NODE_VERSION);
}
