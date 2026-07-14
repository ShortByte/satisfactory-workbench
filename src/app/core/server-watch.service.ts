import { Injectable, computed, inject, signal } from '@angular/core';
import type { RemoteSave } from '../../shared/ipc-types';
import { SftpService } from './sftp.service';
import { SaveService } from './save.service';

const AUTO_KEY = 'sf-sftp-autoupdate';

/**
 * Watches one connected SFTP server: lists its saves, highlights the newest, and
 * on a fixed interval re-checks for a newer one. When a newer save appears it is
 * either loaded automatically (auto-update on) or surfaced as a "pending" save
 * that the navbar reload button can apply. Lives at app scope so the pending
 * indicator survives route changes.
 */
@Injectable({ providedIn: 'root' })
export class ServerWatchService {
  private readonly sftp = inject(SftpService);
  private readonly save = inject(SaveService);

  /** Seconds between automatic checks. */
  readonly intervalSeconds = 30;
  /** Short grace period (shown in the navbar) before an auto-update reload. */
  readonly autoReloadSeconds = 8;

  private readonly _connId = signal<string | null>(null);
  private readonly _connName = signal('');
  private readonly _saves = signal<RemoteSave[]>([]);
  private readonly _pending = signal<RemoteSave | null>(null);
  private readonly _autoUpdate = signal(ServerWatchService.loadAuto());
  private readonly _nextCheckIn = signal(this.intervalSeconds);
  private readonly _checking = signal(false);
  private readonly _error = signal<string | null>(null);
  /** Seconds left before the pending save auto-loads (null = no countdown). */
  private readonly _reloadCountdown = signal<number | null>(null);

  readonly connectionId = this._connId.asReadonly();
  readonly connectionName = this._connName.asReadonly();
  readonly saves = this._saves.asReadonly();
  readonly pending = this._pending.asReadonly();
  readonly autoUpdate = this._autoUpdate.asReadonly();
  readonly nextCheckIn = this._nextCheckIn.asReadonly();
  readonly checking = this._checking.asReadonly();
  readonly error = this._error.asReadonly();
  readonly reloadCountdown = this._reloadCountdown.asReadonly();

  readonly isWatching = computed(() => this._connId() !== null);
  /** Modified-time of the newest save (for highlighting). */
  readonly newestMtime = computed(() => this._saves()[0]?.modifiedAtMs ?? 0);

  /** mtime up to which saves are acknowledged; newer ones count as "new". */
  private baseline = 0;
  private timer?: ReturnType<typeof setInterval>;

  /** Connect to a server and start watching it (replaces any current watch). */
  async start(connId: string, name: string): Promise<void> {
    this.stop();
    this._connId.set(connId);
    this._connName.set(name);
    this._error.set(null);
    this.baseline = 0;
    await this.check(true); // initial listing → baseline = current newest
    this._nextCheckIn.set(this.intervalSeconds);
    this.timer = setInterval(() => this.tick(), 1000);
  }

  /** Stop watching and clear state. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this._connId.set(null);
    this._connName.set('');
    this._saves.set([]);
    this._pending.set(null);
    this._error.set(null);
    this._nextCheckIn.set(this.intervalSeconds);
    this._reloadCountdown.set(null);
  }

  /** Stop only if the given connection is the one being watched. */
  stopIf(connId: string): void {
    if (this._connId() === connId) this.stop();
  }

  setAutoUpdate(on: boolean): void {
    this._autoUpdate.set(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (on) {
      // Schedule the grace-period reload if a new save is already pending.
      if (this._pending() && this._reloadCountdown() === null) {
        this._reloadCountdown.set(this.autoReloadSeconds);
      }
    } else {
      // Cancel the scheduled reload; keep the pending save for a manual reload.
      this._reloadCountdown.set(null);
    }
  }

  /** Force an immediate check and reset the countdown. */
  async checkNow(): Promise<void> {
    this._nextCheckIn.set(this.intervalSeconds);
    await this.check(false);
  }

  /** Apply the pending new save (navbar reload button). */
  async apply(): Promise<void> {
    const p = this._pending();
    if (p) await this.loadSave(p);
  }

  /** Load a specific save chosen from the list. */
  async open(sv: RemoteSave): Promise<void> {
    await this.loadSave(sv);
  }

  private tick(): void {
    const next = this._nextCheckIn() - 1;
    if (next <= 0) {
      this._nextCheckIn.set(this.intervalSeconds);
      void this.check(false);
    } else {
      this._nextCheckIn.set(next);
    }
    // Auto-update grace period: count down, then load the pending save.
    const rc = this._reloadCountdown();
    if (rc !== null) {
      if (rc <= 1) {
        this._reloadCountdown.set(null);
        void this.apply();
      } else {
        this._reloadCountdown.set(rc - 1);
      }
    }
  }

  private async check(initial: boolean): Promise<void> {
    const id = this._connId();
    if (!id) return;
    this._checking.set(true);
    try {
      const saves = await this.sftp.listSaves(id);
      this._saves.set(saves);
      this._error.set(null);
      const newest = saves[0];
      if (initial) {
        this.baseline = newest?.modifiedAtMs ?? 0;
        return;
      }
      if (newest && newest.modifiedAtMs > this.baseline) {
        this._pending.set(newest);
        // Auto-update: show it in the navbar and reload after a short cooldown.
        if (this._autoUpdate() && this._reloadCountdown() === null) {
          this._reloadCountdown.set(this.autoReloadSeconds);
        }
      }
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this._checking.set(false);
    }
  }

  private async loadSave(sv: RemoteSave): Promise<void> {
    const id = this._connId();
    if (!id) return;
    this._reloadCountdown.set(null);
    await this.save.openRemote(id, sv.remotePath, sv.modifiedAtMs);
    this.baseline = sv.modifiedAtMs;
    this._pending.set(null);
  }

  private static loadAuto(): boolean {
    try {
      return localStorage.getItem(AUTO_KEY) === '1';
    } catch {
      return false;
    }
  }
}
