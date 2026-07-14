import { Component, OnInit, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { UpdateService } from '../../core/update.service';
import { I18nService } from '../../i18n/i18n.service';
import type { ReleaseInfo } from '../../../shared/ipc-types';

/** Escape HTML so release-note text can never inject markup. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline Markdown: code, bold, and http(s) links — on already-escaped text. */
function inlineMd(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}

/**
 * Minimal, safe Markdown → HTML for GitHub release notes. Only a fixed whitelist
 * of tags is produced (headings, lists, paragraphs, code, bold, http links);
 * all source text is HTML-escaped first, so nothing from the notes is trusted.
 */
function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 2, 6); // "# " → h3
      out.push(`<h${level}>${inlineMd(heading[2])}</h${level}>`);
    } else if (bullet) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inlineMd(bullet[1])}</li>`);
    } else if (line === '') {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inlineMd(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

/** Dedicated Updates page: update controls + GitHub-releases changelog. */
@Component({
  selector: 'app-updates',
  templateUrl: './updates.html',
  styleUrl: './updates.scss',
})
export class UpdatesPage implements OnInit {
  protected readonly update = inject(UpdateService);
  protected readonly i18n = inject(I18nService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly releases = signal<ReleaseInfo[]>([]);
  protected readonly loadingReleases = signal(false);
  protected readonly releasesError = signal(false);

  ngOnInit(): void {
    this.update.check();
    void this.loadReleases();
  }

  protected async loadReleases(): Promise<void> {
    this.loadingReleases.set(true);
    this.releasesError.set(false);
    try {
      this.releases.set(await this.update.getReleases());
    } catch {
      this.releasesError.set(true);
    } finally {
      this.loadingReleases.set(false);
    }
  }

  protected checkUpdate(): void {
    this.update.check();
  }
  protected downloadUpdate(): void {
    this.update.download();
  }
  protected installUpdate(): void {
    this.update.install();
  }

  /** True when this release matches the installed version. */
  protected isCurrent(r: ReleaseInfo): boolean {
    const norm = (v: string) => v.replace(/^v/i, '');
    return !!this.update.appVersion() && norm(r.version) === norm(this.update.appVersion());
  }

  protected formatDate(iso: string): string {
    if (!iso) return '';
    const locale = this.i18n.lang() === 'de' ? 'de-DE' : 'en-US';
    return new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' });
  }

  protected notes(md: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(mdToHtml(md));
  }
}
