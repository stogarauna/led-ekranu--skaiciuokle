const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  loadLedData: () => ipcRenderer.invoke('led-data:load'),
  openLedDataFile: () => ipcRenderer.invoke('led-data:open-file'),
})