import { TreeComponent } from "./components";
import { Devtool } from "./components/Devtool";
import { useRemoteBlastTree } from "./store";
import { V2App } from "./V2App";

export interface AppProps {
  readonly v2Enabled?: boolean;
}

export const App = ({ v2Enabled = false }: AppProps) => {
  if (v2Enabled && window.electron.v2 !== undefined) {
    return <V2App api={window.electron.v2} />;
  }

  return <LegacyApp />;
};

const LegacyApp = () => {
  const { tree } = useRemoteBlastTree();

  return (
    <>
      <div className="h-full dark text-white">{tree && <TreeComponent blastProps={tree} />}</div>

      <Devtool />
    </>
  );
};
