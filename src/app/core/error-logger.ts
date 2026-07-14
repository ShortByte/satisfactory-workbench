import { ErrorHandler, Injectable, inject } from '@angular/core';
import type { LogEntry } from '../../shared/ipc-types';
import { ErrorLogService } from './error-log.service';

/**
 * Global Angular error handler that forwards every uncaught renderer error to the
 * Electron main process (written to the log file) and records it for the in-app
 * error toast / "report issue" flow. Combined with Angular's
 * `provideBrowserGlobalErrorListeners()`, this also captures window `error` and
 * `unhandledrejection` events. The default console output is preserved for dev.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly bridge = typeof window !== 'undefined' ? window.satisfactory : undefined;
  private readonly errorLog = inject(ErrorLogService);

  handleError(error: unknown): void {
    const err =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : safeStringify(error));
    const entry: LogEntry = { source: 'renderer', message: err.message, stack: err.stack };
    try {
      this.bridge?.logError(entry);
      this.errorLog.record(entry);
    } catch {
      /* never let logging swallow the original error */
    }
    console.error(error);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
