const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zaloCRMDesktop', {
  showMainWindow: () => ipcRenderer.send('zalocrm:show-main-window'),
});
