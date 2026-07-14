import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { I18nService } from './i18n/i18n.service';
import { ServerWatchService } from './core/server-watch.service';
import { SaveService } from './core/save.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly appName = 'Satisfactory Workbench';
  protected readonly i18n = inject(I18nService);
  protected readonly watch = inject(ServerWatchService);
  protected readonly save = inject(SaveService);

  private readonly bridge = typeof window !== 'undefined' ? window.satisfactory : undefined;
  private readonly destroyRef = inject(DestroyRef);

  /** Whether we run inside Electron (custom title-bar controls apply). */
  protected readonly isElectron = !!this.bridge;
  protected readonly maximized = signal(false);

  constructor() {
    if (this.bridge) {
      void this.bridge.windowIsMaximized().then((m) => this.maximized.set(m));
      const off = this.bridge.onWindowMaximizedChanged((m) => this.maximized.set(m));
      this.destroyRef.onDestroy(off);
    }
  }

  /** Load the newer save the server watcher has detected. */
  protected loadPending(): void {
    void this.watch.apply();
  }

  /** Drop the `.sav` extension for display. */
  protected saveName(fileName: string): string {
    return fileName.replace(/\.sav$/i, '');
  }

  protected minimize(): void {
    this.bridge?.windowMinimize();
  }
  protected toggleMaximize(): void {
    this.bridge?.windowMaximizeToggle();
  }
  protected close(): void {
    this.bridge?.windowClose();
  }
}
