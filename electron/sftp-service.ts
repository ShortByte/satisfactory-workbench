import { app } from 'electron';
import SftpClient from 'ssh2-sftp-client';
import { mkdir, readFile, stat, utimes } from 'node:fs/promises';
import { basename, join, posix } from 'node:path';
import { getConnection } from './sftp-config';
import type { RemoteSave, SftpConnection, SftpSecret } from '../src/shared/ipc-types';

/**
 * SFTP operations for dedicated-server saves. Each call opens a short-lived
 * connection (connect → do work → disconnect) so nothing lingers between actions
 * and repeated auto-refresh polls stay stateless.
 */

async function clientConfig(
  meta: SftpConnection,
  secret: SftpSecret | null,
): Promise<SftpClient.ConnectOptions> {
  const cfg: SftpClient.ConnectOptions = {
    host: meta.host,
    port: meta.port,
    username: meta.username,
    readyTimeout: 15_000,
  };
  if (meta.authType === 'key' && secret?.privateKeyPath) {
    cfg.privateKey = await readFile(secret.privateKeyPath);
    if (secret.passphrase) cfg.passphrase = secret.passphrase;
  } else if (secret?.password) {
    cfg.password = secret.password;
  }
  return cfg;
}

async function withClient<T>(
  meta: SftpConnection,
  secret: SftpSecret | null,
  fn: (sftp: SftpClient) => Promise<T>,
): Promise<T> {
  const sftp = new SftpClient();
  await sftp.connect(await clientConfig(meta, secret));
  try {
    return await fn(sftp);
  } finally {
    await sftp.end().catch(() => {});
  }
}

/** List `.sav` files in a remote directory, newest first. */
async function listSaves(
  meta: SftpConnection,
  secret: SftpSecret | null,
): Promise<RemoteSave[]> {
  return withClient(meta, secret, async (sftp) => {
    const items = await sftp.list(meta.remoteDir);
    return items
      .filter((i) => i.type === '-' && i.name.toLowerCase().endsWith('.sav'))
      .map((i) => ({
        fileName: i.name,
        remotePath: posix.join(meta.remoteDir, i.name),
        fileSizeBytes: i.size,
        modifiedAtMs: i.modifyTime,
      }))
      .sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);
  });
}

/** Test an unsaved connection: connect + list the remote dir. */
export async function testConnection(
  meta: SftpConnection,
  secret: SftpSecret | null,
): Promise<RemoteSave[]> {
  return listSaves(meta, secret);
}

/** List saves for a stored connection id. */
export async function listRemoteSaves(id: string): Promise<RemoteSave[]> {
  const conn = await getConnection(id);
  if (!conn) throw new Error('SFTP connection not found');
  return listSaves(conn.meta, conn.secret);
}

/**
 * Download a remote save into the per-connection cache and return the local path.
 * Skips the transfer when a cached copy with the same modified-time already exists
 * (the cache file's mtime is pinned to the remote mtime) — cheap for auto-refresh.
 */
export async function downloadRemoteSave(
  id: string,
  remotePath: string,
  modifiedAtMs: number,
): Promise<string> {
  const conn = await getConnection(id);
  if (!conn) throw new Error('SFTP connection not found');

  const cacheDir = join(app.getPath('userData'), 'sftp-cache', id);
  await mkdir(cacheDir, { recursive: true });
  const localPath = join(cacheDir, basename(remotePath));

  try {
    const st = await stat(localPath);
    if (Math.floor(st.mtimeMs) === Math.floor(modifiedAtMs)) return localPath; // cache hit
  } catch {
    /* not cached yet */
  }

  await withClient(conn.meta, conn.secret, async (sftp) => {
    await sftp.fastGet(remotePath, localPath);
  });
  // Pin the cache file's mtime to the remote mtime so future cache checks match.
  const when = new Date(modifiedAtMs);
  await utimes(localPath, when, when).catch(() => {});
  return localPath;
}
