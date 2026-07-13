import { Component, inject, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SaveService } from '../../core/save.service';

/** Walking-skeleton dashboard: load a save and inspect the parsed summary. */
@Component({
  selector: 'app-dashboard',
  imports: [DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  protected readonly save = inject(SaveService);

  ngOnInit(): void {
    void this.save.refreshBundledSaves();
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
