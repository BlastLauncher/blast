import type { Client } from "rpc-websockets";
import createReact from "zustand";
import create from "zustand/vanilla";

import { BlastStore, BlastComponent } from "./types";

export const remoteBlastTree = create<BlastStore>()((set) => ({
  tree: null,
  setTree: (tree: BlastComponent) => set({ tree }),
  ws: null,
  setWs: (ws: Client) => set({ ws }),
}));

export const useRemoteBlastTree = createReact(remoteBlastTree);
