import { Injectable, signal } from '@angular/core';
import type { LogEntry } from '../../shared/ipc-types';

/** GitHub repo that receives the bug reports. */
const REPO = 'ShortByte/satisfactory-workbench';

/**
 * Holds recent uncaught renderer errors and turns one into a pre-filled GitHub
 * "new issue" URL (title + body with the error, stack, version and system info).
 * Opening the URL lets the user review and submit the report in their browser —
 * no token required (they just need access to the repo).
 */
@Injectable({ providedIn: 'root' })
export class ErrorLogService {
  private readonly bridge = typeof window !== 'undefined' ? window.satisfactory : undefined;
  private version = '';

  private readonly _current = signal<LogEntry | null>(null);
  private readonly _recent = signal<LogEntry[]>([]);
  /** The latest un-dismissed error (drives the toast). */
  readonly current = this._current.asReadonly();
  readonly recent = this._recent.asReadonly();

  constructor() {
    void this.bridge?.appVersion().then((v) => (this.version = v));
  }

  /** Record an error (shown in the toast + kept in the recent list). */
  record(entry: LogEntry): void {
    this._current.set(entry);
    this._recent.update((list) => [entry, ...list].slice(0, 20));
  }

  dismiss(): void {
    this._current.set(null);
  }

  /** Open a pre-filled GitHub issue for the given (or current) error. */
  report(entry: LogEntry | null = this._current()): void {
    if (!entry) return;
    window.open(this.issueUrl(entry), '_blank', 'noopener');
  }

  private issueUrl(entry: LogEntry): string {
    const title = `Error: ${entry.message}`.slice(0, 120);
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const body = [
      'What were you doing when this happened?',
      '',
      '',
      '---',
      `- **Version:** ${this.version || 'unknown'}`,
      `- **Source:** ${entry.source}`,
      `- **System:** ${ua}`,
      '',
      '```',
      entry.message,
      (entry.stack ?? '').slice(0, 3000),
      '```',
    ].join('\n');
    return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(
      title,
    )}&body=${encodeURIComponent(body)}`;
  }
}
