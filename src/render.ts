import JSONRPCReconciler from "./reconciler";
import Command from "./elements/Command";
import { createDebug } from "./utils/debug";
const debug = createDebug("blast:render");

export function render(component: any) {
  const rootElement = new Command();

  const root = JSONRPCReconciler.createContainer(
    rootElement,
    0,
    null,
    true,
    null,
    "",
    (error) => {
      // noop
      debug(`onRecoverableError`, error);
    },
    null
  );

  JSONRPCReconciler.injectIntoDevTools({
    bundleType: 1,
    rendererPackageName: "blast",
    version: "0.0.1",
    findFiberByHostInstance: (instance) => {
      debug(`findFiberByHostInstance`, instance);
      return null;
    },
  });

  JSONRPCReconciler.updateContainer(component, root, null);

  return rootElement;
}
