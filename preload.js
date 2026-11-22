const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('api', {
  java: inv('java'), defaultDir: inv('default-dir'), selectFolder: inv('select-folder'),
  openFolder: inv('open-folder'), meta: inv('meta'), versions: inv('versions'), download: inv('download'),
  start: inv('start'), stop: inv('stop'), command: inv('command'),
  mrSearch: inv('mr-search'), mrInstall: inv('mr-install'), listMods: inv('list-mods'),
  removeMod: inv('remove-mod'), addFiles: inv('add-files'), openMods: inv('open-mods'),
  on: (ch, cb) => ipcRenderer.on(ch, (_, d) => cb(d))
});
