import type { Client } from "rpc-websockets";
import { useStore, create } from "zustand";
import { createStore } from "zustand/vanilla";

import type { BlastStore, BlastComponent } from "./types";

export const remoteBlastTree = createStore<BlastStore>()((set) => ({
  tree: null,
  setTree: (tree: BlastComponent) => set({ tree }),
  ws: null,
  setWs: (ws: Client) => set({ ws }),
}));

export const useRemoteBlastTree = () => useStore(remoteBlastTree);

type BlastUIState = {
  subcommandOpen: boolean,
  setSubcommandOpen: (open: boolean) => void,
  dropdownOpen: boolean,
  setDropdownOpen: (open: boolean) => void,
}

export const useBlastUIStore = create<BlastUIState>((set) => ({
  subcommandOpen: false,
  setSubcommandOpen: (open: boolean) => set({ subcommandOpen: open }),
  dropdownOpen: false,
  setDropdownOpen: (open: boolean) => set({ dropdownOpen: open }),
}))
