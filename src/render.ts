import JSONRPCReconciler from './reconciler';

export function render(component: any, container: any) {
  const root = JSONRPCReconciler.createContainer(
    container,
    0,
    null,
    true,
    null,
    '',
    () => {},
    null,
  );

  JSONRPCReconciler.updateContainer(component, root, null);
}
