import type { Client } from "rpc-websockets";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { BlastStore, BlastComponent } from "./types";

export const remoteBlastTree = createStore<BlastStore>()((set) => ({
  tree: null,
  setTree: (tree: BlastComponent) => set({ tree }),
  ws: null,
  setWs: (ws: Client) => set({ ws }),
}));

export const useRemoteBlastTree = () => useStore(remoteBlastTree);
