import { contextBridge } from 'electron';

/**
 * The narrow bridge the 3D shell sees. Milestone 1 needs only read-only
 * facts; navigation and tabs messages arrive with the HUD in milestone 2.
 */
contextBridge.exposeInMainWorld(
  'hypersol',
  Object.freeze({
    platform: process.platform,
    versions: Object.freeze({
      electron: process.versions['electron'] ?? '',
      chrome: process.versions['chrome'] ?? '',
    }),
  }),
);
