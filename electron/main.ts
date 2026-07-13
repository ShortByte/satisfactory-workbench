import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { SatisfactorySave } from '@etothepii/satisfactory-file-parser';
import {
  IpcChannels,
  type BundledSave,
  type IpcResult,
  type MapFeatureSet,
  type SaveSummary,
} from '../src/shared/ipc-types';
import { parseSaveFile } from './save-service';
import { extractMapFeatures } from './map-service';

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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1b1f24',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => (mainWindow = null));
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
    (): Promise<IpcResult<SaveSummary | null>> =>
      toResult(async () => {
        if (!mainWindow) return null;
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
          title: 'Satisfactory Save-Datei öffnen',
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
        if (!currentSave) throw new Error('Keine Save-Datei geladen.');
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
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
