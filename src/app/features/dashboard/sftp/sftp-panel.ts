import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SftpService } from '../../../core/sftp.service';
import { SaveService } from '../../../core/save.service';
import { ServerWatchService } from '../../../core/server-watch.service';
import { I18nService } from '../../../i18n/i18n.service';
import type { RemoteSave, SftpAuthType, SftpConnectionInput } from '../../../../shared/ipc-types';

/** Editable model backing the "add server" form. */
interface FormModel {
  name: string;
  host: string;
  port: number;
  username: string;
  remoteDir: string;
  authType: SftpAuthType;
  password: string;
  privateKeyPath: string;
  passphrase: string;
}

function emptyModel(): FormModel {
  return {
    name: '',
    host: '',
    port: 22,
    username: '',
    remoteDir: '',
    authType: 'password',
    password: '',
    privateKeyPath: '',
    passphrase: '',
  };
}

/**
 * Dashboard section for SFTP dedicated-server saves. Manage connections, connect
 * to one to watch it (highlights the newest save, re-checks on an interval), and
 * browse/load its saves. The watch itself lives in {@link ServerWatchService} so
 * the navbar reload indicator survives navigation.
 */
@Component({
  selector: 'app-sftp-panel',
  imports: [FormsModule],
  templateUrl: './sftp-panel.html',
  styleUrl: './sftp-panel.scss',
})
export class SftpPanel implements OnInit {
  protected readonly sftp = inject(SftpService);
  protected readonly save = inject(SaveService);
  protected readonly watch = inject(ServerWatchService);
  protected readonly i18n = inject(I18nService);

  protected readonly showForm = signal(false);
  protected readonly model = signal<FormModel>(emptyModel());
  protected readonly testing = signal(false);
  protected readonly saving = signal(false);
  protected readonly formMsg = signal<{ ok: boolean; text: string } | null>(null);

  ngOnInit(): void {
    void this.sftp.refresh();
  }

  // ── Add-server form ───────────────────────────────────────────────────
  protected openForm(): void {
    this.model.set(emptyModel());
    this.formMsg.set(null);
    this.showForm.set(true);
  }

  protected closeForm(): void {
    this.showForm.set(false);
  }

  /** Patch one or more form fields (signal-friendly ngModel binding). */
  protected patch(part: Partial<FormModel>): void {
    this.model.update((m) => ({ ...m, ...part }));
  }

  /**
   * Pasting an SFTP URL into the host field splits it into the form fields:
   * `sftp://user:pass@host:2222/remote/dir` → user, (password), host, port, dir.
   * A plain hostname is left to paste normally.
   */
  protected onHostPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const parsed = this.parseSftpUrl(text);
    if (!parsed) return; // plain hostname — let the default paste happen
    event.preventDefault();
    const m = this.model();
    const part: Partial<FormModel> = { ...parsed };
    if (parsed.password) part.authType = 'password';
    if (!m.name.trim() && parsed.host) part.name = parsed.host;
    this.patch(part);
  }

  /** Parse an sftp/ssh URL or `user@host:port/path` string; null if not URL-like. */
  private parseSftpUrl(raw: string): Partial<FormModel> | null {
    const s = raw.trim();
    if (!s) return null;
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s);
    if (!hasScheme && !/@/.test(s) && !/:\d/.test(s) && !s.includes('/')) return null;
    let url: URL;
    try {
      url = new URL(hasScheme ? s : `sftp://${s}`);
    } catch {
      return null;
    }
    const out: Partial<FormModel> = {};
    if (url.hostname) out.host = url.hostname;
    if (url.port) out.port = Number(url.port);
    if (url.username) out.username = decodeURIComponent(url.username);
    if (url.password) out.password = decodeURIComponent(url.password);
    if (url.pathname && url.pathname !== '/') out.remoteDir = decodeURIComponent(url.pathname);
    return Object.keys(out).length ? out : null;
  }

  protected setAuth(authType: SftpAuthType): void {
    this.patch({ authType });
  }

  protected async pickKey(): Promise<void> {
    const path = await this.sftp.pickKey();
    if (path) this.patch({ privateKeyPath: path });
  }

  private buildInput(): SftpConnectionInput {
    const m = this.model();
    return {
      name: m.name,
      host: m.host,
      port: m.port,
      username: m.username,
      remoteDir: m.remoteDir,
      authType: m.authType,
      secret:
        m.authType === 'key'
          ? { privateKeyPath: m.privateKeyPath, passphrase: m.passphrase || undefined }
          : { password: m.password },
    };
  }

  private valid(): boolean {
    const m = this.model();
    return m.host.trim().length > 0 && m.username.trim().length > 0;
  }

  protected async test(): Promise<void> {
    if (!this.valid()) {
      this.formMsg.set({ ok: false, text: this.i18n.t('sftp.required') });
      return;
    }
    this.testing.set(true);
    this.formMsg.set(null);
    const res = await this.sftp.test(this.buildInput());
    this.testing.set(false);
    this.formMsg.set(
      res.ok
        ? { ok: true, text: this.i18n.t('sftp.testOk', { n: res.count ?? 0 }) }
        : { ok: false, text: this.i18n.t('sftp.testFail', { error: res.error ?? '' }) },
    );
  }

  protected async submit(): Promise<void> {
    if (!this.valid()) {
      this.formMsg.set({ ok: false, text: this.i18n.t('sftp.required') });
      return;
    }
    this.saving.set(true);
    const err = await this.sftp.add(this.buildInput());
    this.saving.set(false);
    if (err) {
      this.formMsg.set({ ok: false, text: err });
      return;
    }
    this.showForm.set(false);
  }

  protected async remove(id: string): Promise<void> {
    this.watch.stopIf(id);
    await this.sftp.remove(id);
  }

  // ── Connect / watch ───────────────────────────────────────────────────
  protected isConnected(id: string): boolean {
    return this.watch.connectionId() === id;
  }

  /** Connect (start watching) a server, or disconnect if it's already active. */
  protected toggle(id: string, name: string): void {
    if (this.isConnected(id)) this.watch.stop();
    else void this.watch.start(id, name);
  }

  protected openSave(sv: RemoteSave): void {
    void this.watch.open(sv);
  }

  protected isNewest(sv: RemoteSave): boolean {
    return sv.modifiedAtMs === this.watch.newestMtime();
  }

  protected onAutoToggle(event: Event): void {
    this.watch.setAutoUpdate((event.target as HTMLInputElement).checked);
  }

  // ── Formatting helpers ────────────────────────────────────────────────
  protected saveName(fileName: string): string {
    return fileName.replace(/\.sav$/i, '');
  }

  protected formatDate(ms: number): string {
    const locale = this.i18n.lang() === 'de' ? 'de-DE' : 'en-US';
    return new Date(ms).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  protected formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value.toFixed(1)} ${units[unit]}`;
  }
}
