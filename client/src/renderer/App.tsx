import { useCallback } from "react";

import { useRemoteBlastTree } from "./store";

export const App = () => {
  const { tree, ws } = useRemoteBlastTree();

  const onClick = useCallback(() => {
    ws.call("action-:r0:");
  }, [ws]);

  const testPopAction = useCallback(() => {
    ws.call("blast-global:pop");
  }, [ws]);

  return (
    <pre>
      <code>{JSON.stringify(tree, null, 2)}</code>

      <button onClick={onClick}>Test Action</button>
      <button onClick={testPopAction}>Test Pop</button>
    </pre>
  );
};
