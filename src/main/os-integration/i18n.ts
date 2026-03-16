import { EventEmitter } from 'events';

type Locale = string;
type PluralForm = 'zero' | 'one' | 'few' | 'many' | 'other';

interface PluralRules {
  [key: string]: (n: number) => PluralForm;
}

interface Translation {
  [key: string]: string | { [form in PluralForm]?: string };
}

interface TranslationBundle {
  [locale: string]: Translation;
}

const PLURAL_RULES: PluralRules = {
  'en': (n) => (n === 1 ? 'one' : 'other'),
  'es': (n) => (n === 1 ? 'one' : 'other'),
  'fr': (n) => (n === 0 || n === 1 ? 'one' : 'other'),
  'de': (n) => (n === 1 ? 'one' : 'other'),
  'ja': () => 'other',
  'zh': () => 'other',
  'ko': () => 'other',
  'ar': (n) => {
    if (n === 0) return 'zero';
    if (n === 1) return 'one';
    if (n === 2) return 'few';
    if (n % 100 >= 3 && n % 100 <= 10) return 'many';
    return 'other';
  },
  'hi': (n) => (n === 1 ? 'one' : 'other'),
  'pt': (n) => (n === 1 ? 'one' : 'other')
};

const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

const DEFAULT_TRANSLATIONS: Translation = {
  'settings': 'Settings',
  'chat': 'Chat',
  'send': 'Send',
  'cancel': 'Cancel',
  'save': 'Save',
  'delete': 'Delete',
  'edit': 'Edit',
  'close': 'Close',
  'ok': 'OK',
  'error': 'Error',
  'warning': 'Warning',
  'info': 'Info',
  'success': 'Success',
  'loading': 'Loading...',
  'search': 'Search',
  'home': 'Home',
  'back': 'Back',
  'next': 'Next',
  'previous': 'Previous',
  'about': 'About',
  'help': 'Help',
  'preferences': 'Preferences',
  'logout': 'Log Out',
  'login': 'Log In',
  'signup': 'Sign Up',
  'profile': 'Profile',
  'notifications': 'Notifications',
  'refresh': 'Refresh',
  'download': 'Download',
  'upload': 'Upload'
};

class I18nManager extends EventEmitter {
  private currentLocale: Locale = 'en';
  private translations: TranslationBundle = {};
  private fallbackLocale: Locale = 'en';

  constructor() {
    super();
    this.initializeDefaultLocale();
  }

  /**
   * Initialize with English translations
   */
  private initializeDefaultLocale(): void {
    this.translations['en'] = { ...DEFAULT_TRANSLATIONS };
  }

  /**
   * Set the current locale
   */
  setLocale(locale: Locale): void {
    const normalized = this.normalizeLocale(locale);
    this.currentLocale = normalized;
    this.emit('locale-changed', { locale: normalized, timestamp: Date.now() });
  }

  /**
   * Get the current locale
   */
  getLocale(): Locale {
    return this.currentLocale;
  }

  /**
   * Translate a key with optional parameter interpolation
   */
  t(key: string, params?: Record<string, string>): string {
    const rawTranslation = this.findTranslation(key);

    if (!rawTranslation) {
      this.emit('missing-translation', { key, locale: this.currentLocale });
      return key;
    }

    // Handle both string and plural forms - just take the string form if it's an object
    const translation = typeof rawTranslation === 'string' ? rawTranslation : (rawTranslation['other'] || '');

    let result = translation;

    // Interpolate parameters
    if (params) {
      Object.entries(params).forEach(([paramKey, value]) => {
        result = result.replace(`{{${paramKey}}}`, value);
      });
    }

    return result;
  }

  /**
   * Translate with pluralization support
   */
  tp(key: string, count: number, params?: Record<string, string>): string {
    const translation = this.findTranslation(key);

    if (!translation || typeof translation === 'string') {
      return this.t(key, params);
    }

    const pluralForm = this.getPluralForm(count);
    const pluralText = (translation[pluralForm] || translation['other'] || key) as string;

    let result = pluralText;

    // Interpolate parameters and count
    const allParams = { ...params, count: String(count) };
    Object.entries(allParams).forEach(([paramKey, value]) => {
      result = result.replace(`{{${paramKey}}}`, value);
    });

    return result;
  }

  /**
   * Load a complete translation bundle for a locale
   */
  loadTranslations(locale: Locale, translations: Translation): void {
    const normalized = this.normalizeLocale(locale);
    this.translations[normalized] = {
      ...this.translations[normalized],
      ...translations
    };
    this.emit('translations-loaded', { locale: normalized, count: Object.keys(translations).length });
  }

  /**
   * Add a single translation
   */
  addTranslation(locale: Locale, key: string, value: string | { [form in PluralForm]?: string }): void {
    const normalized = this.normalizeLocale(locale);
    if (!this.translations[normalized]) {
      this.translations[normalized] = {};
    }
    this.translations[normalized][key] = value;
    this.emit('translation-added', { locale: normalized, key });
  }

  /**
   * Find missing translation keys for a locale
   */
  getMissingKeys(locale: Locale): string[] {
    const normalized = this.normalizeLocale(locale);
    const bundleKeys = Object.keys(this.translations[normalized] || {});
    const referenceKeys = Object.keys(this.translations['en']);

    return referenceKeys.filter(key => !bundleKeys.includes(key));
  }

  /**
   * Format a number according to locale
   */
  formatNumber(n: number, locale?: Locale): string {
    const targetLocale = locale || this.currentLocale;
    try {
      return new Intl.NumberFormat(this.getIntlLocale(targetLocale)).format(n);
    } catch {
      return String(n);
    }
  }

  /**
   * Format a date according to locale
   */
  formatDate(d: Date, locale?: Locale): string {
    const targetLocale = locale || this.currentLocale;
    try {
      return new Intl.DateTimeFormat(this.getIntlLocale(targetLocale)).format(d);
    } catch {
      return d.toISOString();
    }
  }

  /**
   * Format currency according to locale
   */
  formatCurrency(n: number, currency: string, locale?: Locale): string {
    const targetLocale = locale || this.currentLocale;
    try {
      return new Intl.NumberFormat(this.getIntlLocale(targetLocale), {
        style: 'currency',
        currency: currency.toUpperCase()
      }).format(n);
    } catch {
      return `${currency} ${n}`;
    }
  }

  /**
   * Check if locale uses right-to-left text direction
   */
  isRtl(locale?: Locale): boolean {
    const targetLocale = locale || this.currentLocale;
    const lang = targetLocale.split('-')[0].toLowerCase();
    return RTL_LOCALES.has(lang);
  }

  /**
   * Get supported locales (stub implementations available)
   */
  getSupportedLocales(): Locale[] {
    return ['en', 'es', 'fr', 'de', 'ja', 'zh', 'ko', 'ar', 'hi', 'pt'];
  }

  // ============= Private helper methods =============

  private normalizeLocale(locale: Locale): Locale {
    // Normalize to language-only format if needed
    const base = locale.split('-')[0].toLowerCase();
    return base;
  }

  private getIntlLocale(locale: Locale): string {
    const supported = ['en-US', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'zh-CN', 'ko-KR', 'ar-SA', 'hi-IN', 'pt-BR'];
    return supported.find(l => l.startsWith(locale.substring(0, 2))) || 'en-US';
  }

  private findTranslation(key: string): string | { [form in PluralForm]?: string } | null {
    // Try current locale
    if (this.translations[this.currentLocale]?.[key]) {
      return this.translations[this.currentLocale][key];
    }

    // Try language-only fallback
    const lang = this.currentLocale.split('-')[0];
    if (lang !== this.currentLocale && this.translations[lang]?.[key]) {
      return this.translations[lang][key];
    }

    // Try English fallback
    if (this.currentLocale !== 'en' && this.translations['en']?.[key]) {
      return this.translations['en'][key];
    }

    return null;
  }

  private getPluralForm(count: number): PluralForm {
    const lang = this.currentLocale.split('-')[0];
    const rule = PLURAL_RULES[lang] || PLURAL_RULES['en'];
    return rule(count);
  }
}

// Export singleton instance
export const i18n = new I18nManager();

export { I18nManager, Locale, Translation, TranslationBundle, PluralForm };
