const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  loadLedData: () => ipcRenderer.invoke('led-data:load'),
  openLedDataFile: () => ipcRenderer.invoke('led-data:open-file'),
  loadUsers: () => ipcRenderer.invoke('users:list'),
  loginUser: (username, password) => ipcRenderer.invoke('users:login', { username, password }),
  createUser: (payload) => ipcRenderer.invoke('users:create', payload),
  deleteUser: (username) => ipcRenderer.invoke('users:delete', username),
  openUsersFile: () => ipcRenderer.invoke('users:open-file'),
})