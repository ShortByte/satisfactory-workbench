import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DiscoveredSave, SaveLocation, SavePlatform } from '../src/shared/ipc-types';

/**
 * Auto-discovery of local Satisfactory save folders.
 *
 * The game (Steam and Epic alike) writes saves to
 *   %LOCALAPPDATA%\FactoryGame\Saved\SaveGames\<accountId>\*.sav
 * where `<accountId>` is the Steam ID64 (all digits) or Epic account id (32 hex
 * chars). We scan that root, list each account folder that contains saves, and
 * classify it by the folder-name shape so the UI can group Steam/Epic separately.
 */

/** Absolute path of the Satisfactory SaveGames root, or null on unsupported OS. */
function saveGamesRoot(): string | null {
  const local =
    process.env.LOCALAPPDATA ??
    (process.platform === 'win32' ? join(homedir(), 'AppData', 'Local') : null);
  if (!local) return null;
  return join(local, 'FactoryGame', 'Saved', 'SaveGames');
}

/** Classify an account folder by its name shape. */
function classify(folderName: string): SavePlatform {
  if (/^\d{16,20}$/.test(folderName)) return 'steam';
  if (/^[0-9a-fA-F]{32}$/.test(folderName)) return 'epic';
  if (folderName.toLowerCase() === 'common') return 'common';
  return 'other';
}

/** List `.sav` files directly inside `dir`, newest first. */
async function savesIn(dir: string): Promise<DiscoveredSave[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: DiscoveredSave[] = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.sav')) continue;
    const filePath = join(dir, entry);
    try {
      const s = await stat(filePath);
      if (!s.isFile()) continue;
      out.push({ filePath, fileName: entry, fileSizeBytes: s.size, modifiedAtMs: s.mtimeMs });
    } catch {
      /* skip unreadable file */
    }
  }
  out.sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);
  return out;
}

/** Discover all local save folders that contain at least one save. */
export async function discoverSaveLocations(): Promise<SaveLocation[]> {
  const root = saveGamesRoot();
  if (!root) return [];

  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return []; // game not installed / folder missing
  }

  const locations: SaveLocation[] = [];

  // Older layouts keep saves directly in the root.
  const rootSaves = await savesIn(root);
  if (rootSaves.length) {
    locations.push({ platform: 'other', accountId: '', dirPath: root, saves: rootSaves });
  }

  for (const name of names) {
    const dirPath = join(root, name);
    let s;
    try {
      s = await stat(dirPath);
    } catch {
      continue;
    }
    if (!s.isDirectory()) continue;
    const saves = await savesIn(dirPath);
    if (!saves.length) continue;
    locations.push({ platform: classify(name), accountId: name, dirPath, saves });
  }

  const order: Record<SavePlatform, number> = { steam: 0, epic: 1, common: 2, other: 3 };
  locations.sort(
    (a, b) =>
      order[a.platform] - order[b.platform] ||
      (b.saves[0]?.modifiedAtMs ?? 0) - (a.saves[0]?.modifiedAtMs ?? 0),
  );
  return locations;
}
