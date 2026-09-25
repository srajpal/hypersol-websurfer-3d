// Stand-in for an untrusted preload a webview might ask for (check C7).
// If the main process failed to replace it, the page would see this flag.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('evilPreloadRan', true);
