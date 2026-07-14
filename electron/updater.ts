import type { BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IpcChannels, type UpdateStatus } from '../src/shared/ipc-types';

/**
 * Auto-update via GitHub releases (electron-updater). The main process drives the
 * check/download/install; every state change is pushed to the renderer so the
 * navbar can show "update available → downloading → restart to install".
 *
 * Downloads are user-initiated (autoDownload = false) so nothing large happens
 * behind the user's back.
 */

let getWindow: () => BrowserWindow | null = () => null;

function send(status: UpdateStatus): void {
  getWindow()?.webContents.send(IpcChannels.UpdateStatus, status);
}

export function initAutoUpdater(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => send({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => send({ state: 'not-available' }));
  autoUpdater.on('download-progress', (p) =>
    send({ state: 'downloading', progressPercent: Math.round(p.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    send({ state: 'downloaded', version: info.version }),
  );
  autoUpdater.on('error', (err) =>
    send({ state: 'error', error: err instanceof Error ? err.message : String(err) }),
  );
}

/** Check GitHub releases for a newer version. */
export async function checkForUpdates(): Promise<void> {
  await autoUpdater.checkForUpdates();
}

/** Download the available update (emits download-progress → update-downloaded). */
export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate();
}

/** Quit and install a downloaded update. */
export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
