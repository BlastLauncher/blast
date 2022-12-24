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
};

export const remoteBlastTree = create<BlastStore>()((set) => ({
  tree: null,
  setTree: (tree: BlastComponent) => set({ tree }),
}));

export const useRemoteBlastTree = createReact(remoteBlastTree);
