// import { renderTreeComponent } from "./components";
import { Devtool } from "./components/Devtool";
import { useRemoteBlastTree } from "./store";

export const App = () => {
  const { tree, ws } = useRemoteBlastTree();

  return (
    <>
      <pre>{/* {tree && renderTreeComponent(tree)} */}</pre>

      <Devtool />
    </>
  );
};
