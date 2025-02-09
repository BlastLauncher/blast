import { TreeComponent } from "./components";
import { Devtool } from "./components/Devtool";
import { useRemoteBlastTree } from "./store";

export const App = () => {
  const { tree } = useRemoteBlastTree();

  return (
    <>
      <div className="h-full dark text-white">{tree && <TreeComponent blastProps={tree} />}</div>

      <Devtool />
    </>
  );
};
