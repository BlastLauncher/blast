import { contextBridge, ipcRenderer } from 'electron'

import { EventTypes } from './renderer/types'

contextBridge.exposeInMainWorld('electron', {
  closeWindow: () =>  ipcRenderer.invoke(EventTypes.CLOSE),
})

