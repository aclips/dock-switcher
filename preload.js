const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    readSettings: () => ipcRenderer.invoke('read-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    checkDockerCompose: (folderPath) => ipcRenderer.invoke('check-docker-compose', folderPath),
    checkRunningContainers: () => ipcRenderer.invoke('check-running-containers'),
    getDockerComposeName: (folderPath) => ipcRenderer.invoke('get-docker-compose-name', folderPath),
    runCommandUp: (name, workingDirectory) => ipcRenderer.invoke('run-command-up', name, workingDirectory),
    runCommandDown: (name, workingDirectory) => ipcRenderer.invoke('run-command-down', name, workingDirectory),
});
