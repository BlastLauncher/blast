import { useCallback, useRef } from "react";

// import { renderTreeComponent } from "./components";
import { useRemoteBlastTree } from "./store";

export const App = () => {
  const { tree, ws } = useRemoteBlastTree();
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const onClick = useCallback(() => {
    const value = inputRef.current?.value;
    const params = textareaRef.current?.value;

    if (!value) {
      return;
    }

    try {
      const parsedParams = JSON.parse(params || "null");

      console.log(value, parsedParams, "value, parsedParams");

      ws.call(value, parsedParams);
    } catch (e) {
      console.error(e);
    }
  }, [ws]);

  const testPopAction = useCallback(() => {
    ws.call("blast-global:pop");
  }, [ws]);

  console.log(tree, "tree");

  return (
    <pre>
      {/* {tree && renderTreeComponent(tree)} */}

      <code>{JSON.stringify(tree, null, 2)}</code>

      <input type="text" ref={inputRef} defaultValue="action:r0:" />
      <textarea ref={textareaRef} />

      <button onClick={onClick}>Test Action</button>
      <button onClick={testPopAction}>Test Pop</button>
    </pre>
  );
};
