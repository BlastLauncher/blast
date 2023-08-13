import { contextBridge, ipcRenderer } from 'electron'

import { EventTypes } from './types'

contextBridge.exposeInMainWorld('electron', {
  startNodeInstallation: () =>  ipcRenderer.invoke(EventTypes.INSTALL_NODE),
  exitAndStart: () => ipcRenderer.invoke(EventTypes.EXIT_AND_START)
})

