import { useRemoteBlastTree } from "./store";

export const App = () => {
  const { tree } = useRemoteBlastTree();

  return (
    <pre>
      <code>{JSON.stringify(tree, null, 2)}</code>
    </pre>
  );
};
