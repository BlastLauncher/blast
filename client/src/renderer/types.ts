import { Client } from "rpc-websockets";

export type BlastComponent = {
  elementType: string;
  props: Record<string, any>;
  children: BlastComponent[];
};

export type BlastStore = {
  tree: BlastComponent | null;
  setTree: (tree: BlastComponent) => void;

  ws: Client | null;
  setWs: (ws: Client) => void;
};
