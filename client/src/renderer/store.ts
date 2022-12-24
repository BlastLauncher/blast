import type { Client } from "rpc-websockets";
import createReact from "zustand";
import create from "zustand/vanilla";

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

export const remoteBlastTree = create<BlastStore>()((set) => ({
  tree: null,
  setTree: (tree: BlastComponent) => set({ tree }),
  ws: null,
  setWs: (ws: Client) => set({ ws }),
}));

export const useRemoteBlastTree = createReact(remoteBlastTree);
