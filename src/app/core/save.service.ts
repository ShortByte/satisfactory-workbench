import { Injectable, computed, inject, signal } from '@angular/core';
import type { BundledSave, SaveLocation, SaveSummary } from '../../shared/ipc-types';
import { I18nService } from '../i18n/i18n.service';

/**
 * Renderer-side facade over the Electron IPC bridge (`window.satisfactory`).
 * Holds the currently loaded save summary and exposes loading/error state as signals.
 */
@Injectable({ providedIn: 'root' })
export class SaveService {
  private readonly bridge = typeof window !== 'undefined' ? window.satisfactory : undefined;

  private readonly i18n = inject(I18nService);

  /** True when running inside Electron (the preload bridge is present). */
  readonly isElectron = !!this.bridge;

  private readonly _summary = signal<SaveSummary | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _bundled = signal<BundledSave[]>([]);
  private readonly _locations = signal<SaveLocation[]>([]);

  readonly summary = this._summary.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly bundledSaves = this._bundled.asReadonly();
  /** Auto-discovered local save folders (Steam/Epic accounts). */
  readonly saveLocations = this._locations.asReadonly();
  readonly hasSave = computed(() => this._summary() !== null);

  /** Open the native file picker and parse the chosen save. */
  async openViaDialog(): Promise<void> {
    if (!this.bridge) return this.failNoBridge();
    await this.run(async () => {
      const res = await this.bridge!.openSaveDialog(this.i18n.t('dialog.openSaveTitle'));
      if (!res.ok) throw new Error(res.error);
      // null = user cancelled the dialog; keep current state.
      if (res.data) this._summary.set(res.data);
    });
  }

  /** Parse a save at a known path (e.g. a bundled sample). */
  async openPath(filePath: string): Promise<void> {
    if (!this.bridge) return this.failNoBridge();
    await this.run(async () => {
      const res = await this.bridge!.parseSavePath(filePath);
      if (!res.ok) throw new Error(res.error);
      this._summary.set(res.data);
    });
  }

  /** Download (cached) + parse a remote save from an SFTP connection. */
  async openRemote(connectionId: string, remotePath: string, modifiedAtMs: number): Promise<void> {
    if (!this.bridge) return this.failNoBridge();
    await this.run(async () => {
      const res = await this.bridge!.sftpOpen(connectionId, remotePath, modifiedAtMs);
      if (!res.ok) throw new Error(res.error);
      this._summary.set(res.data);
    });
  }

  /** Refresh the list of saves bundled in the project's `saves/` folder. */
  async refreshBundledSaves(): Promise<void> {
    if (!this.bridge) return;
    const res = await this.bridge.listBundledSaves();
    this._bundled.set(res.ok ? res.data : []);
  }

  /** Auto-discover local Satisfactory save folders (Steam/Epic accounts). */
  async discoverSaves(): Promise<void> {
    if (!this.bridge) return;
    const res = await this.bridge.discoverSaves();
    this._locations.set(res.ok ? res.data : []);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      await action();
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this._loading.set(false);
    }
  }

  private failNoBridge(): void {
    this._error.set(this.i18n.t('err.noBridge'));
  }
}
