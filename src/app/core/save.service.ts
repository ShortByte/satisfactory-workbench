import { Injectable, computed, signal } from '@angular/core';
import type { BundledSave, SaveSummary } from '../../shared/ipc-types';

/**
 * Renderer-side facade over the Electron IPC bridge (`window.satisfactory`).
 * Holds the currently loaded save summary and exposes loading/error state as signals.
 */
@Injectable({ providedIn: 'root' })
export class SaveService {
  private readonly bridge = typeof window !== 'undefined' ? window.satisfactory : undefined;

  /** True when running inside Electron (the preload bridge is present). */
  readonly isElectron = !!this.bridge;

  private readonly _summary = signal<SaveSummary | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _bundled = signal<BundledSave[]>([]);

  readonly summary = this._summary.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly bundledSaves = this._bundled.asReadonly();
  readonly hasSave = computed(() => this._summary() !== null);

  /** Open the native file picker and parse the chosen save. */
  async openViaDialog(): Promise<void> {
    if (!this.bridge) return this.failNoBridge();
    await this.run(async () => {
      const res = await this.bridge!.openSaveDialog();
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

  /** Refresh the list of saves bundled in the project's `saves/` folder. */
  async refreshBundledSaves(): Promise<void> {
    if (!this.bridge) return;
    const res = await this.bridge.listBundledSaves();
    this._bundled.set(res.ok ? res.data : []);
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
    this._error.set(
      'Die Electron-Bridge ist nicht verfügbar. Bitte die App über "npm run dev" starten.',
    );
  }
}
