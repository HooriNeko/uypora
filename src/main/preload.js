const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  convertFile: (filePath) => ipcRenderer.invoke('convert-file', filePath),
  savePdf: (base64Data) => ipcRenderer.invoke('save-pdf', base64Data),
  onOpenFile: (callback) => ipcRenderer.on('open-file', (event, filePath) => callback(filePath))
});