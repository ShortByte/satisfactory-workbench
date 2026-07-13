import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannels,
  type BundledSave,
  type IpcResult,
  type MapFeatureSet,
  type SatisfactoryBridge,
  type SaveSummary,
} from '../src/shared/ipc-types';

/**
 * Safe, typed bridge exposed to the renderer as `window.satisfactory`.
 * Only these explicitly-listed channels are reachable from the Angular app.
 */
const bridge: SatisfactoryBridge = {
  openSaveDialog: (): Promise<IpcResult<SaveSummary | null>> =>
    ipcRenderer.invoke(IpcChannels.OpenSaveDialog),
  parseSavePath: (filePath: string): Promise<IpcResult<SaveSummary>> =>
    ipcRenderer.invoke(IpcChannels.ParseSavePath, filePath),
  listBundledSaves: (): Promise<IpcResult<BundledSave[]>> =>
    ipcRenderer.invoke(IpcChannels.ListBundledSaves),
  getMapFeatures: (): Promise<IpcResult<MapFeatureSet>> =>
    ipcRenderer.invoke(IpcChannels.GetMapFeatures),
};

contextBridge.exposeInMainWorld('satisfactory', bridge);
