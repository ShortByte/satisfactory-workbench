import { Injectable, effect, signal } from '@angular/core';
import { LANGS, TRANSLATIONS, type Lang } from './translations';

const STORAGE_KEY = 'sf-lang';

/**
 * Runtime i18n over the {@link TRANSLATIONS} table. The active language is a
 * signal, so any template expression that calls {@link t} re-renders when the
 * language changes. Initial language: persisted choice → system language → EN.
 * English is always the fallback for missing keys.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  /** Languages offered by the switcher. */
  readonly available = LANGS;

  /** Currently active language. */
  readonly lang = signal<Lang>(I18nService.initialLang());

  constructor() {
    // Persist the choice and reflect it on <html lang> for a11y / spellcheck.
    effect(() => {
      const l = this.lang();
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        /* storage unavailable — keep in-memory only */
      }
      if (typeof document !== 'undefined') document.documentElement.lang = l;
    });
  }

  setLang(l: Lang): void {
    this.lang.set(l);
  }

  /**
   * Translate a key for the active language, falling back to English and then
   * the raw key. `{name}` placeholders are replaced from `params`.
   */
  t(key: string, params?: Record<string, string | number>): string {
    const entry = TRANSLATIONS[key];
    const raw = entry ? (entry[this.lang()] ?? entry.en) : key;
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
      name in params ? String(params[name]) : `{${name}}`,
    );
  }

  private static initialLang(): Lang {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'de') return saved;
    } catch {
      /* ignore */
    }
    const sys = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
    return sys.startsWith('de') ? 'de' : 'en';
  }
}
