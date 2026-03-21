import React, { useState, useEffect, useCallback } from 'react';

interface LocaleInfo {
  code: string;
  name: string;
  rtl: boolean;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface FormatPreview {
  number: string;
  date: string;
  currency: string;
}

declare global {
  interface Window {
    nyra?: {
      i18n: {
        init: () => Promise<any>;
        t: (...args: any[]) => Promise<any>;
        tp: (...args: any[]) => Promise<any>;
        setLocale: (...args: any[]) => Promise<any>;
        getLocale: () => Promise<any>;
        getSupportedLocales: () => Promise<any>;
        formatNumber: (...args: any[]) => Promise<any>;
        formatDate: (...args: any[]) => Promise<any>;
        formatCurrency: (...args: any[]) => Promise<any>;
        isRtl: (...args: any[]) => Promise<any>;
        loadTranslations: (...args: any[]) => Promise<any>;
        getMissingKeys: () => Promise<any>;
      };
    };
  }
}

export default function I18nSettingsPanel() {
  const [currentLocale, setCurrentLocale] = useState<string>('en');
  const [supportedLocales, setSupportedLocales] = useState<LocaleInfo[]>([]);
  const [isRtl, setIsRtl] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Test Translation
  const [translationKey, setTranslationKey] = useState('greeting');
  const [translationResult, setTranslationResult] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  // Format Preview
  const [formatPreview, setFormatPreview] = useState<FormatPreview>({
    number: '',
    date: '',
    currency: '',
  });
  const [isFormattingPreview, setIsFormattingPreview] = useState(false);

  // Missing Keys
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const [isMissingLoading, setIsMissingLoading] = useState(false);

  // Load Custom Translations
  const [isLoadingTranslations, setIsLoadingTranslations] = useState(false);

  // Sample RTL/LTR text
  const [previewText] = useState(
    'The quick brown fox jumps over the lazy dog. This sample text demonstrates text direction.'
  );

  useEffect(() => {
    loadLocalesAndSettings();
  }, []);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const loadLocalesAndSettings = async () => {
    try {
      setIsLoading(true);
      const [locales, locale, rtl] = await Promise.all([
        window.nyra?.i18n?.getSupportedLocales(),
        window.nyra?.i18n?.getLocale(),
        window.nyra?.i18n?.isRtl?.(),
      ]);

      if (Array.isArray(locales)) {
        setSupportedLocales(locales);
      }
      if (locale) {
        setCurrentLocale(locale);
      }
      if (typeof rtl === 'boolean') {
        setIsRtl(rtl);
      }
      addToast('Settings loaded', 'success');
    } catch (err) {
      addToast(`Failed to load settings: ${err}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetLocale = async (locale: string) => {
    try {
      await window.nyra?.i18n?.setLocale(locale);
      setCurrentLocale(locale);
      const rtl = await window.nyra?.i18n?.isRtl?.(locale);
      if (typeof rtl === 'boolean') {
        setIsRtl(rtl);
      }
      addToast(`Locale changed to ${locale}`, 'success');
      loadFormatPreview();
    } catch (err) {
      addToast(`Failed to set locale: ${err}`, 'error');
    }
  };

  const handleTestTranslation = async () => {
    if (!translationKey.trim()) {
      addToast('Please enter a translation key', 'error');
      return;
    }

    try {
      setIsTesting(true);
      const result = await window.nyra?.i18n?.t(translationKey);
      setTranslationResult(result || `[${translationKey}]`);
      addToast('Translation retrieved', 'success');
    } catch (err) {
      setTranslationResult(`Error: ${err}`);
      addToast(`Translation failed: ${err}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const loadFormatPreview = async () => {
    try {
      setIsFormattingPreview(true);
      const [number, date, currency] = await Promise.all([
        window.nyra?.i18n?.formatNumber(12345.67),
        window.nyra?.i18n?.formatDate(Date.now()),
        window.nyra?.i18n?.formatCurrency(99.99, 'USD'),
      ]);

      setFormatPreview({
        number: number || '12345.67',
        date: date || new Date().toLocaleDateString(),
        currency: currency || '$99.99',
      });
      addToast('Format preview loaded', 'success');
    } catch (err) {
      addToast(`Failed to load format preview: ${err}`, 'error');
    } finally {
      setIsFormattingPreview(false);
    }
  };

  const handleGetMissingKeys = async () => {
    try {
      setIsMissingLoading(true);
      const result = await window.nyra?.i18n?.getMissingKeys();
      if (Array.isArray(result)) {
        setMissingKeys(result);
        addToast(`Found ${result.length} missing keys`, 'info');
      }
    } catch (err) {
      addToast(`Failed to get missing keys: ${err}`, 'error');
    } finally {
      setIsMissingLoading(false);
    }
  };

  const handleLoadTranslations = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsLoadingTranslations(true);
      const content = await file.text();
      const bundle = JSON.parse(content);
      await window.nyra?.i18n?.loadTranslations(currentLocale, bundle);
      addToast('Translations loaded successfully', 'success');
    } catch (err) {
      addToast(`Failed to load translations: ${err}`, 'error');
    } finally {
      setIsLoadingTranslations(false);
    }
  };

  const currentLocaleInfo = supportedLocales.find(l => l.code === currentLocale);

  return (
    <div className={`space-y-6 p-6 bg-nyra-surface rounded-lg h-full flex flex-col overflow-hidden ${
      isRtl ? 'dir-rtl' : ''
    }`}>
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${
              toast.type === 'success' ? 'bg-green-700' :
              toast.type === 'error' ? 'bg-red-700' :
              'bg-blue-700'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-gray-100">Language Settings</h2>
        <p className="text-sm text-gray-400">Localization & internationalization</p>
      </div>

      {/* Current Locale Display */}
      <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-2">
        <p className="text-xs text-gray-500 uppercase font-semibold">Current Locale</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-[#D4785C]">{currentLocaleInfo?.name || currentLocale}</p>
            <p className="text-xs text-gray-500 mt-1">Code: {currentLocale.toUpperCase()}</p>
          </div>
          {isRtl && (
            <div className="px-3 py-1 bg-purple-900 text-purple-200 rounded text-xs font-semibold">
              RTL
            </div>
          )}
        </div>
      </div>

      {/* Locale Selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-400 uppercase">Select Language</label>
        <select
          value={currentLocale}
          onChange={(e) => handleSetLocale(e.target.value)}
          disabled={isLoading}
          className="w-full bg-[#1a1816] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 hover:border-gray-600 focus:outline-none focus:border-[#D4785C] disabled:opacity-50"
        >
          {supportedLocales.map(locale => (
            <option key={locale.code} value={locale.code}>
              {locale.name} ({locale.code})
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {/* RTL Indicator */}
        {isRtl && (
          <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-3">
            <p className="text-xs font-semibold text-purple-300">
              Right-to-Left Layout Active
            </p>
            <p className="text-xs text-purple-400 mt-1">
              Text direction and UI elements are mirrored for RTL languages.
            </p>
          </div>
        )}

        {/* Test Translation */}
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase">Test Translation</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Translation key"
              value={translationKey}
              onChange={(e) => setTranslationKey(e.target.value)}
              className="flex-1 bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C]"
            />
            <button
              onClick={handleTestTranslation}
              disabled={isTesting}
              className="bg-[#C9A87C] hover:bg-[#b89668] text-[#0d0b09] font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
            >
              {isTesting ? 'Testing...' : 'Test'}
            </button>
          </div>
          {translationResult && (
            <div className="bg-[#0d0b09] rounded p-3 text-sm text-gray-200">
              {translationResult}
            </div>
          )}
        </div>

        {/* Format Preview */}
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs font-semibold text-gray-400 uppercase">Format Preview</p>
            <button
              onClick={loadFormatPreview}
              disabled={isFormattingPreview}
              className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-200 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-500 mb-1">Number (12345.67)</p>
              <p className="text-sm text-gray-200 font-mono bg-[#0d0b09] rounded p-2">
                {formatPreview.number}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Date</p>
              <p className="text-sm text-gray-200 font-mono bg-[#0d0b09] rounded p-2">
                {formatPreview.date}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Currency (99.99 USD)</p>
              <p className="text-sm text-gray-200 font-mono bg-[#0d0b09] rounded p-2">
                {formatPreview.currency}
              </p>
            </div>
          </div>
        </div>

        {/* RTL/LTR Preview */}
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase">Text Direction Preview</p>
          <div className={`bg-[#0d0b09] rounded p-3 text-sm text-gray-200 leading-relaxed ${
            isRtl ? 'text-right' : 'text-left'
          }`}>
            {previewText}
          </div>
          <p className="text-xs text-gray-500">
            Direction: {isRtl ? 'Right-to-Left' : 'Left-to-Right'}
          </p>
        </div>

        {/* Missing Keys Diagnostic */}
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs font-semibold text-gray-400 uppercase">Missing Keys Diagnostic</p>
            <button
              onClick={handleGetMissingKeys}
              disabled={isMissingLoading}
              className="text-xs bg-[#D4785C] hover:bg-[#c8653a] px-3 py-1 rounded text-white font-semibold disabled:opacity-50"
            >
              {isMissingLoading ? 'Scanning...' : 'Scan'}
            </button>
          </div>
          {missingKeys.length > 0 && (
            <div className="bg-yellow-900/30 border border-yellow-700 rounded p-3 max-h-32 overflow-y-auto">
              <p className="text-xs text-yellow-300 font-semibold mb-2">
                {missingKeys.length} missing translation keys found:
              </p>
              <div className="space-y-1">
                {missingKeys.slice(0, 10).map((key, idx) => (
                  <p key={idx} className="text-xs text-yellow-400 font-mono">
                    {key}
                  </p>
                ))}
                {missingKeys.length > 10 && (
                  <p className="text-xs text-yellow-400 italic">
                    ... and {missingKeys.length - 10} more
                  </p>
                )}
              </div>
            </div>
          )}
          {missingKeys.length === 0 && isMissingLoading === false && (
            <p className="text-xs text-gray-500 italic">Click Scan to check for missing keys</p>
          )}
        </div>

        {/* Load Custom Translations */}
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase">Load Custom Translations</p>
          <label className="block">
            <input
              type="file"
              accept=".json"
              onChange={handleLoadTranslations}
              disabled={isLoadingTranslations}
              className="w-full text-xs text-gray-400 file:bg-[#D4785C] file:text-white file:font-semibold file:py-2 file:px-3 file:rounded file:cursor-pointer file:border-0 disabled:opacity-50"
            />
          </label>
          <p className="text-xs text-gray-500">
            Upload a JSON file with translations for the current locale
          </p>
        </div>

        {/* Supported Locales */}
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Supported Languages</p>
          <div className="grid grid-cols-2 gap-2">
            {supportedLocales.map(locale => (
              <div
                key={locale.code}
                className={`text-xs p-2 rounded font-semibold ${
                  locale.code === currentLocale
                    ? 'bg-[#D4785C] text-white'
                    : 'bg-[#0d0b09] text-gray-400'
                }`}
              >
                <div>{locale.name}</div>
                <div className="text-xs font-mono opacity-80">({locale.code})</div>
                {locale.rtl && <div className="text-xs opacity-80">RTL</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
