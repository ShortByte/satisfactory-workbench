import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannels,
  type BundledSave,
  type IpcResult,
  type MapFeatureSet,
  type ReleaseInfo,
  type RemoteSave,
  type SatisfactoryBridge,
  type SaveLocation,
  type SaveSummary,
  type SftpConnection,
  type SftpConnectionInput,
  type UpdateStatus,
} from '../src/shared/ipc-types';

/**
 * Safe, typed bridge exposed to the renderer as `window.satisfactory`.
 * Only these explicitly-listed channels are reachable from the Angular app.
 */
const bridge: SatisfactoryBridge = {
  openSaveDialog: (title?: string): Promise<IpcResult<SaveSummary | null>> =>
    ipcRenderer.invoke(IpcChannels.OpenSaveDialog, title),
  parseSavePath: (filePath: string): Promise<IpcResult<SaveSummary>> =>
    ipcRenderer.invoke(IpcChannels.ParseSavePath, filePath),
  listBundledSaves: (): Promise<IpcResult<BundledSave[]>> =>
    ipcRenderer.invoke(IpcChannels.ListBundledSaves),
  discoverSaves: (): Promise<IpcResult<SaveLocation[]>> =>
    ipcRenderer.invoke(IpcChannels.DiscoverSaves),

  sftpList: (): Promise<IpcResult<SftpConnection[]>> => ipcRenderer.invoke(IpcChannels.SftpList),
  sftpAdd: (input: SftpConnectionInput): Promise<IpcResult<SftpConnection>> =>
    ipcRenderer.invoke(IpcChannels.SftpAdd, input),
  sftpRemove: (id: string): Promise<IpcResult<null>> =>
    ipcRenderer.invoke(IpcChannels.SftpRemove, id),
  sftpTest: (input: SftpConnectionInput): Promise<IpcResult<RemoteSave[]>> =>
    ipcRenderer.invoke(IpcChannels.SftpTest, input),
  sftpPickKey: (): Promise<IpcResult<string | null>> =>
    ipcRenderer.invoke(IpcChannels.SftpPickKey),
  sftpListSaves: (id: string): Promise<IpcResult<RemoteSave[]>> =>
    ipcRenderer.invoke(IpcChannels.SftpListSaves, id),
  sftpOpen: (
    id: string,
    remotePath: string,
    modifiedAtMs: number,
  ): Promise<IpcResult<SaveSummary>> =>
    ipcRenderer.invoke(IpcChannels.SftpOpen, id, remotePath, modifiedAtMs),

  appVersion: (): Promise<string> => ipcRenderer.invoke(IpcChannels.AppVersion),
  getReleases: (): Promise<IpcResult<ReleaseInfo[]>> =>
    ipcRenderer.invoke(IpcChannels.GetReleases),
  updateCheck: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IpcChannels.UpdateCheck),
  updateDownload: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IpcChannels.UpdateDownload),
  updateInstall: () => ipcRenderer.send(IpcChannels.UpdateInstall),
  onUpdateStatus: (cb: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_e: unknown, status: UpdateStatus) => cb(status);
    ipcRenderer.on(IpcChannels.UpdateStatus, listener);
    return () => ipcRenderer.removeListener(IpcChannels.UpdateStatus, listener);
  },

  getMapFeatures: (): Promise<IpcResult<MapFeatureSet>> =>
    ipcRenderer.invoke(IpcChannels.GetMapFeatures),

  windowMinimize: () => ipcRenderer.send(IpcChannels.WindowMinimize),
  windowMaximizeToggle: () => ipcRenderer.send(IpcChannels.WindowMaximizeToggle),
  windowClose: () => ipcRenderer.send(IpcChannels.WindowClose),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.WindowIsMaximized),
  onWindowMaximizedChanged: (cb: (maximized: boolean) => void): (() => void) => {
    const listener = (_e: unknown, maximized: boolean) => cb(maximized);
    ipcRenderer.on(IpcChannels.WindowMaximizedChanged, listener);
    return () => ipcRenderer.removeListener(IpcChannels.WindowMaximizedChanged, listener);
  },
};

contextBridge.exposeInMainWorld('satisfactory', bridge);
