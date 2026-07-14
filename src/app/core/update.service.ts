import { Injectable, computed, signal } from '@angular/core';
import type { UpdateStatus } from '../../shared/ipc-types';

/**
 * Renderer-side facade for the GitHub-releases auto-updater. Subscribes to
 * status pushes from the main process and exposes them as signals so the navbar
 * can reflect available → downloading → ready-to-install.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly bridge = typeof window !== 'undefined' ? window.satisfactory : undefined;

  /** Whether the updater is reachable (Electron only). */
  readonly available = !!this.bridge;

  private readonly _status = signal<UpdateStatus>({ state: 'idle' });
  readonly status = this._status.asReadonly();

  private readonly _appVersion = signal('');
  readonly appVersion = this._appVersion.asReadonly();

  readonly state = computed(() => this._status().state);
  readonly version = computed(() => this._status().version ?? '');
  readonly progress = computed(() => this._status().progressPercent ?? 0);
  readonly error = computed(() => this._status().error ?? '');

  constructor() {
    // Root singleton lives for the app's lifetime — no unsubscribe needed.
    this.bridge?.onUpdateStatus((status) => this._status.set(status));
    void this.bridge?.appVersion().then((v) => this._appVersion.set(v));
  }

  /** Manually check for a newer release (optimistic 'checking' state). */
  check(): void {
    this._status.set({ state: 'checking' });
    void this.bridge?.updateCheck();
  }

  /** Start downloading the available update (optimistic UI, then real progress). */
  download(): void {
    this._status.set({ state: 'downloading', progressPercent: 0, version: this._status().version });
    void this.bridge?.updateDownload();
  }

  /** Quit and install the downloaded update. */
  install(): void {
    this.bridge?.updateInstall();
  }
}
