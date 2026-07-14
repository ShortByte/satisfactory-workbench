import { app } from 'electron';
import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Minimal file logger for uncaught errors from both processes. Main-process
 * failures are hooked directly; renderer failures arrive over IPC (see main.ts).
 * Writes to `<logs>/error.log` (Electron's per-app logs directory), with a single
 * rotation once the file grows past ~2 MB so it can't grow unbounded.
 */

const MAX_BYTES = 2 * 1024 * 1024;

function logDir(): string {
  return app.getPath('logs');
}
function logFile(): string {
  return join(logDir(), 'error.log');
}

// Serialise writes so concurrent errors don't interleave / race the rotation.
let queue: Promise<void> = Promise.resolve();

async function rotateIfNeeded(): Promise<void> {
  try {
    const s = await stat(logFile());
    if (s.size > MAX_BYTES) await rename(logFile(), `${logFile()}.old`);
  } catch {
    /* no file yet — nothing to rotate */
  }
}

/** Append one error record to the log file (never throws). */
export function logError(source: string, message: string, stack?: string): void {
  const time = new Date().toISOString();
  const entry = `[${time}] [${source}] ${message}${stack ? `\n${stack}` : ''}\n`;
  queue = queue
    .then(async () => {
      await mkdir(logDir(), { recursive: true });
      await rotateIfNeeded();
      await appendFile(logFile(), entry, 'utf8');
    })
    .catch(() => {
      /* logging must never crash the app */
    });
}

/** Absolute path to the log directory (for "open logs" actions). */
export function logDirectory(): string {
  return logDir();
}

/** Hook main-process uncaught errors into the file log. */
export function initErrorLogging(): void {
  process.on('uncaughtException', (err) => {
    logError('main:uncaughtException', err.message, err.stack);
  });
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logError('main:unhandledRejection', err.message, err.stack);
  });
}
