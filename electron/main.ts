import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { SatisfactorySave } from '@etothepii/satisfactory-file-parser';
import {
  IpcChannels,
  IpcErrorCode,
  type BundledSave,
  type IpcResult,
  type MapFeatureSet,
  type ReleaseInfo,
  type RemoteSave,
  type SaveLocation,
  type SaveSummary,
  type SftpConnection,
  type SftpConnectionInput,
} from '../src/shared/ipc-types';
import { parseSaveFile } from './save-service';
import { extractMapFeatures } from './map-service';
import { discoverSaveLocations } from './save-locations';
import { addConnection, listConnections, removeConnection } from './sftp-config';
import { downloadRemoteSave, listRemoteSaves, testConnection } from './sftp-service';
import {
  checkForUpdates,
  downloadUpdate,
  fetchReleases,
  initAutoUpdater,
  quitAndInstall,
} from './updater';

/** Dev server URL served by `ng serve` (see the `dev` npm script). */
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:4200';

/** Built Angular output. Compiled main lives in dist-electron/electron/, so the
 *  project root is two levels up. */
const RENDERER_INDEX = resolve(__dirname, '../../dist/satisfactory-tools/browser/index.html');

/** Project-bundled saves folder (dev convenience for quick testing). */
const BUNDLED_SAVES_DIR = resolve(__dirname, '../../saves');

let mainWindow: BrowserWindow | null = null;

/**
 * Last successfully parsed save, kept in memory so upcoming features (map,
 * calculator) can query it without re-parsing. Not yet exposed over IPC.
 */
let currentSave: SatisfactorySave | null = null;

/**
 * App logo for the window/taskbar. In dev we use the multi-size .ico for a crisp
 * taskbar icon; in the packaged app the exe icon (set by electron-builder from
 * build/icon.ico) drives the taskbar, and the renderer logo.png is the fallback.
 */
const APP_ICON = app.isPackaged
  ? resolve(__dirname, '../../dist/satisfactory-tools/browser/logo.png')
  : resolve(__dirname, '../../build/icon.ico');

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#14161a',
    show: false,
    icon: APP_ICON,
    frame: false, // custom title bar (rendered by the Angular app)
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => (mainWindow = null));
  // Open external links (e.g. changelog/GitHub) in the user's browser, not a new window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const sendMaximized = () =>
    mainWindow?.webContents.send(IpcChannels.WindowMaximizedChanged, mainWindow.isMaximized());
  mainWindow.on('maximize', sendMaximized);
  mainWindow.on('unmaximize', sendMaximized);
  mainWindow.webContents.on('did-finish-load', () =>
    console.log('[main] renderer loaded:', mainWindow?.webContents.getURL()),
  );
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) =>
    console.error('[main] renderer failed to load:', code, desc, url),
  );
  // Surface renderer warnings/errors in the dev terminal (level 2=warning, 3=error).
  // Electron 43 passes a MessageDetails object as the second arg; cast defensively
  // since the typings still carry the deprecated (event, level, message) overload.
  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (_e, details) => {
      const d = details as unknown as { level: number; message: string };
      if (d?.level >= 2) console.error('[renderer]', d.message);
    });
  }

  if (app.isPackaged) {
    void mainWindow.loadFile(RENDERER_INDEX);
  } else {
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

/** Wrap an async handler so any thrown error becomes a structured IpcResult. */
async function toResult<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(
    IpcChannels.OpenSaveDialog,
    (_evt, title?: string): Promise<IpcResult<SaveSummary | null>> =>
      toResult(async () => {
        if (!mainWindow) return null;
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
          // Title is localized in the renderer and passed in; keep an English fallback.
          title: title ?? 'Open Satisfactory save',
          properties: ['openFile'],
          defaultPath: BUNDLED_SAVES_DIR,
          filters: [{ name: 'Satisfactory Save', extensions: ['sav'] }],
        });
        if (canceled || filePaths.length === 0) return null;
        const { summary, save } = await parseSaveFile(filePaths[0]);
        currentSave = save;
        return summary;
      }),
  );

  ipcMain.handle(
    IpcChannels.ParseSavePath,
    (_evt, filePath: string): Promise<IpcResult<SaveSummary>> =>
      toResult(async () => {
        const { summary, save } = await parseSaveFile(filePath);
        currentSave = save;
        return summary;
      }),
  );

  ipcMain.handle(
    IpcChannels.GetMapFeatures,
    (): Promise<IpcResult<MapFeatureSet>> =>
      toResult(async () => {
        if (!currentSave) throw new Error(IpcErrorCode.NoSaveLoaded);
        return extractMapFeatures(currentSave);
      }),
  );

  ipcMain.handle(
    IpcChannels.ListBundledSaves,
    (): Promise<IpcResult<BundledSave[]>> =>
      toResult(async () => {
        let entries: string[];
        try {
          entries = await readdir(BUNDLED_SAVES_DIR);
        } catch {
          return [];
        }
        const saves: BundledSave[] = [];
        for (const entry of entries) {
          if (!entry.toLowerCase().endsWith('.sav')) continue;
          const filePath = join(BUNDLED_SAVES_DIR, entry);
          const info = await stat(filePath);
          saves.push({ filePath, fileName: entry, fileSizeBytes: info.size });
        }
        return saves;
      }),
  );

  ipcMain.handle(
    IpcChannels.DiscoverSaves,
    (): Promise<IpcResult<SaveLocation[]>> => toResult(() => discoverSaveLocations()),
  );

  // ── SFTP dedicated-server connections ────────────────────────────────
  ipcMain.handle(
    IpcChannels.SftpList,
    (): Promise<IpcResult<SftpConnection[]>> => toResult(() => listConnections()),
  );

  ipcMain.handle(
    IpcChannels.SftpAdd,
    (_evt, input: SftpConnectionInput): Promise<IpcResult<SftpConnection>> =>
      toResult(() => addConnection(input)),
  );

  ipcMain.handle(
    IpcChannels.SftpRemove,
    (_evt, id: string): Promise<IpcResult<null>> =>
      toResult(async () => {
        await removeConnection(id);
        return null;
      }),
  );

  ipcMain.handle(
    IpcChannels.SftpTest,
    (_evt, input: SftpConnectionInput): Promise<IpcResult<RemoteSave[]>> =>
      toResult(() =>
        testConnection(
          {
            id: '',
            name: input.name,
            host: input.host,
            port: input.port && input.port > 0 ? input.port : 22,
            username: input.username,
            remoteDir: input.remoteDir || '.',
            authType: input.authType,
          },
          input.secret,
        ),
      ),
  );

  ipcMain.handle(
    IpcChannels.SftpPickKey,
    (): Promise<IpcResult<string | null>> =>
      toResult(async () => {
        if (!mainWindow) return null;
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
          title: 'Select SSH private key',
          properties: ['openFile', 'showHiddenFiles'],
        });
        return canceled || filePaths.length === 0 ? null : filePaths[0];
      }),
  );

  ipcMain.handle(
    IpcChannels.SftpListSaves,
    (_evt, id: string): Promise<IpcResult<RemoteSave[]>> => toResult(() => listRemoteSaves(id)),
  );

  ipcMain.handle(
    IpcChannels.SftpOpen,
    (_evt, id: string, remotePath: string, modifiedAtMs: number): Promise<IpcResult<SaveSummary>> =>
      toResult(async () => {
        const localPath = await downloadRemoteSave(id, remotePath, modifiedAtMs);
        const { summary, save } = await parseSaveFile(localPath);
        currentSave = save;
        return summary;
      }),
  );

  // ── Auto-update (GitHub releases) ────────────────────────────────────
  ipcMain.handle(IpcChannels.AppVersion, () => app.getVersion());

  ipcMain.handle(
    IpcChannels.GetReleases,
    (): Promise<IpcResult<ReleaseInfo[]>> => toResult(() => fetchReleases()),
  );

  ipcMain.handle(
    IpcChannels.UpdateCheck,
    (): Promise<IpcResult<null>> =>
      toResult(async () => {
        if (app.isPackaged) {
          await checkForUpdates();
        } else {
          // No updates in dev; report a clean "up to date" so the UI stays quiet.
          mainWindow?.webContents.send(IpcChannels.UpdateStatus, { state: 'not-available' });
        }
        return null;
      }),
  );
  ipcMain.handle(
    IpcChannels.UpdateDownload,
    (): Promise<IpcResult<null>> =>
      toResult(async () => {
        await downloadUpdate();
        return null;
      }),
  );
  ipcMain.on(IpcChannels.UpdateInstall, () => quitAndInstall());

  // Custom title-bar window controls.
  ipcMain.on(IpcChannels.WindowMinimize, () => mainWindow?.minimize());
  ipcMain.on(IpcChannels.WindowMaximizeToggle, () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on(IpcChannels.WindowClose, () => mainWindow?.close());
  ipcMain.handle(IpcChannels.WindowIsMaximized, () => mainWindow?.isMaximized() ?? false);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // no default Electron menu bar
  registerIpcHandlers();
  createWindow();
  initAutoUpdater(() => mainWindow);

  // Check for updates shortly after startup (packaged builds only).
  if (app.isPackaged) {
    setTimeout(() => void checkForUpdates().catch(() => {}), 4000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
