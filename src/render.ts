import JSONRPCReconciler from "./reconciler";
import Command from "./elements/Command";

export function render(component: any) {
  const rootElement = new Command();

  const root = JSONRPCReconciler.createContainer(
    rootElement,
    0,
    null,
    true,
    null,
    "",
    () => {
      // noop
    },
    null
  );

  JSONRPCReconciler.updateContainer(component, root, null);

  return rootElement;
}
