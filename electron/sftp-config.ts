import { app, safeStorage } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SftpConnection, SftpConnectionInput, SftpSecret } from '../src/shared/ipc-types';

/**
 * Persistent store for SFTP dedicated-server connections.
 *
 * Connection metadata (host/user/dir) is stored as plain JSON in userData;
 * the secret (password / key passphrase) is encrypted with the OS keychain via
 * Electron `safeStorage` (Windows DPAPI). The renderer only ever sees metadata —
 * secrets never leave the main process.
 */

interface StoredConnection extends SftpConnection {
  /** Base64 of the encrypted secret JSON, or null when there is none. */
  secretEnc: string | null;
}

interface StoreFile {
  connections: StoredConnection[];
}

const PLAIN_PREFIX = 'PLAIN:';

function storePath(): string {
  return join(app.getPath('userData'), 'sftp-connections.json');
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await readFile(storePath(), 'utf8');
    const parsed = JSON.parse(raw) as StoreFile;
    return { connections: Array.isArray(parsed.connections) ? parsed.connections : [] };
  } catch {
    return { connections: [] };
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  await mkdir(dirname(storePath()), { recursive: true });
  await writeFile(storePath(), JSON.stringify(store, null, 2), 'utf8');
}

function encryptSecret(secret: SftpSecret | undefined): string | null {
  if (!secret) return null;
  const hasAny = secret.password || secret.privateKeyPath || secret.passphrase;
  if (!hasAny) return null;
  const json = JSON.stringify(secret);
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(json).toString('base64');
  }
  // Keychain unavailable (rare) — fall back to obfuscated base64 so the app still works.
  return PLAIN_PREFIX + Buffer.from(json, 'utf8').toString('base64');
}

function decryptSecret(enc: string | null): SftpSecret | null {
  if (!enc) return null;
  try {
    if (enc.startsWith(PLAIN_PREFIX)) {
      return JSON.parse(Buffer.from(enc.slice(PLAIN_PREFIX.length), 'base64').toString('utf8'));
    }
    return JSON.parse(safeStorage.decryptString(Buffer.from(enc, 'base64')));
  } catch {
    return null;
  }
}

/** Strip the encrypted secret so only safe metadata reaches the renderer. */
function toMeta(c: StoredConnection): SftpConnection {
  const { secretEnc: _secretEnc, ...meta } = c;
  return meta;
}

export async function listConnections(): Promise<SftpConnection[]> {
  const store = await readStore();
  return store.connections.map(toMeta);
}

export async function addConnection(input: SftpConnectionInput): Promise<SftpConnection> {
  const store = await readStore();
  const conn: StoredConnection = {
    id: randomUUID(),
    name: input.name.trim() || input.host,
    host: input.host.trim(),
    port: input.port && input.port > 0 ? input.port : 22,
    username: input.username.trim(),
    remoteDir: input.remoteDir.trim() || '.',
    authType: input.authType,
    secretEnc: encryptSecret(input.secret),
  };
  store.connections.push(conn);
  await writeStore(store);
  return toMeta(conn);
}

export async function removeConnection(id: string): Promise<void> {
  const store = await readStore();
  store.connections = store.connections.filter((c) => c.id !== id);
  await writeStore(store);
}

/** Get a connection's metadata + decrypted secret (main-process use only). */
export async function getConnection(
  id: string,
): Promise<{ meta: SftpConnection; secret: SftpSecret | null } | null> {
  const store = await readStore();
  const conn = store.connections.find((c) => c.id === id);
  if (!conn) return null;
  return { meta: toMeta(conn), secret: decryptSecret(conn.secretEnc) };
}
