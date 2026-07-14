import type { BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IpcChannels, type ReleaseInfo, type UpdateStatus } from '../src/shared/ipc-types';

/** GitHub repository that hosts the releases (matches the publish config). */
const REPO = 'ShortByte/satisfactory-workbench';

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

interface GithubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

/** Fetch published (non-draft) GitHub releases for the changelog page. */
export async function fetchReleases(): Promise<ReleaseInfo[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'satisfactory-workbench' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = (await res.json()) as GithubRelease[];
  return data
    .filter((r) => !r.draft)
    .map((r) => ({
      version: r.tag_name,
      name: r.name || r.tag_name,
      notes: r.body ?? '',
      date: r.published_at,
      url: r.html_url,
      prerelease: r.prerelease,
    }));
}
