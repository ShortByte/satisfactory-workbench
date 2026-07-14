import { Component, inject, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SaveService } from '../../core/save.service';
import { I18nService } from '../../i18n/i18n.service';
import { SftpPanel } from './sftp/sftp-panel';
import type { SavePlatform } from '../../../shared/ipc-types';

/** Dashboard: browse/load a save (auto-discovered or manual) and inspect its summary. */
@Component({
  selector: 'app-dashboard',
  imports: [DecimalPipe, SftpPanel],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  protected readonly save = inject(SaveService);
  protected readonly i18n = inject(I18nService);

  ngOnInit(): void {
    this.refresh();
  }

  /** Re-scan bundled + auto-discovered save folders. */
  protected refresh(): void {
    void this.save.refreshBundledSaves();
    void this.save.discoverSaves();
  }

  /** Localized platform label for a discovered save folder. */
  protected platformLabel(platform: SavePlatform): string {
    return this.i18n.t(`dash.platform.${platform}`);
  }

  /** Drop the `.sav` extension — the file name is usually the session name. */
  protected saveName(fileName: string): string {
    return fileName.replace(/\.sav$/i, '');
  }

  /** Shorten a long account id for display (keep head + tail). */
  protected shortId(accountId: string): string {
    return accountId.length > 12 ? `${accountId.slice(0, 6)}…${accountId.slice(-4)}` : accountId;
  }

  /** Localized date + time for a save's last-modified timestamp. */
  protected formatDate(ms: number): string {
    const locale = this.i18n.lang() === 'de' ? 'de-DE' : 'en-US';
    return new Date(ms).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  /** Human-readable file size. */
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

  /** Seconds of playtime as e.g. "12h 34m". */
  protected formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  /** Strip the Unreal path down to a readable class name. */
  protected shortType(typePath: string): string {
    const last = typePath.split('/').pop() ?? typePath;
    return last.split('.').pop() ?? last;
  }
}
