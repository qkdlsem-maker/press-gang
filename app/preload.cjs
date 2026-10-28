const { contextBridge, ipcRenderer, webUtils } = require('electron');
const invoke = async (name, ...args) => {
  const response = await ipcRenderer.invoke(name, ...args);
  if (!response.ok) throw new Error(response.error);
  return response.value;
};
contextBridge.exposeInMainWorld('gang', {
  desktop: true,
  language: () => invoke('language-get'),
  setLanguage: language => invoke('language-set', language),
  pick: () => invoke('pick-files'),
  paste: () => invoke('paste'),
  copy: ids => invoke('copy-results', ids),
  quickSave: ids => invoke('quick-save', ids),
  quickNext: () => invoke('quick-next'),
  integrationStatus: () => invoke('integration-status'),
  setIntegration: enabled => invoke('integration-set', enabled),
  drop: files => invoke('import-files', Array.from(files).map(file => webUtils.getPathForFile(file))),
  compress: (ids, config) => invoke('compress', ids, config),
  cancel: () => invoke('cancel'),
  remove: id => invoke('remove', id),
  save: ids => invoke('save', ids),
  reveal: dest => invoke('reveal', dest),
  drag: id => invoke('drag-result', id),
  licenses: () => invoke('licenses'),
  on: (name, callback) => {
    if (!['job-progress', 'job-done', 'job-error', 'batch-done', 'quick-request'].includes(name)) return;
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(name, listener);
    return () => ipcRenderer.removeListener(name, listener);
  }
});
