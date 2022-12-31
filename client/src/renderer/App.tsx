import { renderTreeComponent } from "./components";
import { Devtool } from "./components/Devtool";
import { useRemoteBlastTree } from "./store";

export const App = () => {
  const { tree } = useRemoteBlastTree();

  return (
    <>
      <div className="dark h-full">{tree && renderTreeComponent(tree)}</div>

      <Devtool />
    </>
  );
};
