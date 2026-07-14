import { Injectable, inject, signal } from '@angular/core';
import type {
  RemoteSave,
  SftpConnection,
  SftpConnectionInput,
} from '../../shared/ipc-types';
import { I18nService } from '../i18n/i18n.service';

/** Result of a connection test: ok + number of saves found, or an error message. */
export interface SftpTestResult {
  ok: boolean;
  count?: number;
  error?: string;
}

/**
 * Renderer-side facade for the SFTP dedicated-server bridge. Holds the list of
 * saved connections; remote-save listings are fetched on demand (the dashboard
 * component owns the per-connection view + auto-refresh state).
 */
@Injectable({ providedIn: 'root' })
export class SftpService {
  private readonly bridge = typeof window !== 'undefined' ? window.satisfactory : undefined;
  private readonly i18n = inject(I18nService);

  readonly available = !!this.bridge;

  private readonly _connections = signal<SftpConnection[]>([]);
  readonly connections = this._connections.asReadonly();

  /** Load the saved connections. */
  async refresh(): Promise<void> {
    if (!this.bridge) return;
    const res = await this.bridge.sftpList();
    this._connections.set(res.ok ? res.data : []);
  }

  /** Persist a new connection; returns null on success or an error message. */
  async add(input: SftpConnectionInput): Promise<string | null> {
    if (!this.bridge) return this.i18n.t('err.bridgeUnavailable');
    const res = await this.bridge.sftpAdd(input);
    if (!res.ok) return res.error;
    await this.refresh();
    return null;
  }

  async remove(id: string): Promise<void> {
    if (!this.bridge) return;
    await this.bridge.sftpRemove(id);
    await this.refresh();
  }

  /** Connect + list without saving, to validate a form before adding it. */
  async test(input: SftpConnectionInput): Promise<SftpTestResult> {
    if (!this.bridge) return { ok: false, error: this.i18n.t('err.bridgeUnavailable') };
    const res = await this.bridge.sftpTest(input);
    return res.ok ? { ok: true, count: res.data.length } : { ok: false, error: res.error };
  }

  /** Open a native dialog to pick a private-key file. */
  async pickKey(): Promise<string | null> {
    if (!this.bridge) return null;
    const res = await this.bridge.sftpPickKey();
    return res.ok ? res.data : null;
  }

  /** List `.sav` files for a saved connection (throws on failure). */
  async listSaves(id: string): Promise<RemoteSave[]> {
    if (!this.bridge) throw new Error(this.i18n.t('err.bridgeUnavailable'));
    const res = await this.bridge.sftpListSaves(id);
    if (!res.ok) throw new Error(res.error);
    return res.data;
  }
}
