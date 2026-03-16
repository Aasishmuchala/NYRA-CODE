import React, { useState, useEffect } from 'react';

type LocaleCode = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh' | 'ko' | 'ar' | 'hi' | 'pt';

interface LocaleInfo {
  code: LocaleCode;
  name: string;
  rtl: boolean;
}

interface TranslationSample {
  key: string;
  en: string;
  translated: string;
  complete: boolean;
}

export default function I18nSettingsPanel() {
  const [currentLocale, setCurrentLocale] = useState<LocaleCode>('en');
  const [locales] = useState<LocaleInfo[]>([
    { code: 'en', name: 'English', rtl: false },
    { code: 'es', name: 'Español', rtl: false },
    { code: 'fr', name: 'Français', rtl: false },
    { code: 'de', name: 'Deutsch', rtl: false },
    { code: 'ja', name: '日本語', rtl: false },
    { code: 'zh', name: '中文', rtl: false },
    { code: 'ko', name: '한국어', rtl: false },
    { code: 'ar', name: 'العربية', rtl: true },
    { code: 'hi', name: 'हिन्दी', rtl: false },
    { code: 'pt', name: 'Português', rtl: false },
  ]);
  const [samples, setSamples] = useState<TranslationSample[]>([]);
  const [missingCount, setMissingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadLocaleData(currentLocale);
  }, [currentLocale]);

  const loadLocaleData = async (locale: LocaleCode) => {
    try {
      setIsLoading(true);
      const data = await (window.nyra?.i18n?.getLocaleData as any)?.(locale);

      if (data) {
        setSamples(data.samples || generateSamples(locale));
        setMissingCount(data.missingCount || 0);
      }
    } catch (err) {
      console.error('Failed to load locale data:', err);
      setSamples(generateSamples(locale));
    } finally {
      setIsLoading(false);
    }
  };

  const generateSamples = (locale: LocaleCode): TranslationSample[] => {
    const sampleTranslations: Record<LocaleCode, Record<string, string>> = {
      en: {
        greeting: 'Hello',
        welcome: 'Welcome to NYRA',
        settings: 'Settings',
        save: 'Save Changes',
        cancel: 'Cancel',
      },
      es: {
        greeting: 'Hola',
        welcome: 'Bienvenido a NYRA',
        settings: 'Configuración',
        save: 'Guardar cambios',
        cancel: 'Cancelar',
      },
      fr: {
        greeting: 'Bonjour',
        welcome: 'Bienvenue dans NYRA',
        settings: 'Paramètres',
        save: 'Enregistrer les modifications',
        cancel: 'Annuler',
      },
      de: {
        greeting: 'Hallo',
        welcome: 'Willkommen bei NYRA',
        settings: 'Einstellungen',
        save: 'Änderungen speichern',
        cancel: 'Abbrechen',
      },
      ja: {
        greeting: 'こんにちは',
        welcome: 'NYRAへようこそ',
        settings: '設定',
        save: '変更を保存',
        cancel: 'キャンセル',
      },
      zh: {
        greeting: '你好',
        welcome: '欢迎来到 NYRA',
        settings: '设置',
        save: '保存更改',
        cancel: '取消',
      },
      ko: {
        greeting: '안녕하세요',
        welcome: 'NYRA에 오신 것을 환영합니다',
        settings: '설정',
        save: '변경사항 저장',
        cancel: '취소',
      },
      ar: {
        greeting: 'مرحبا',
        welcome: 'مرحبا بك في NYRA',
        settings: 'الإعدادات',
        save: 'حفظ التغييرات',
        cancel: 'إلغاء',
      },
      hi: {
        greeting: 'नमस्ते',
        welcome: 'NYRA में आपका स्वागत है',
        settings: 'सेटिंग्स',
        save: 'परिवर्तन सहेजें',
        cancel: 'रद्द करें',
      },
      pt: {
        greeting: 'Olá',
        welcome: 'Bem-vindo ao NYRA',
        settings: 'Configurações',
        save: 'Salvar alterações',
        cancel: 'Cancelar',
      },
    };

    const keys = ['greeting', 'welcome', 'settings', 'save', 'cancel'];
    const translations = sampleTranslations[locale] || sampleTranslations.en;

    return keys.map(key => ({
      key,
      en: sampleTranslations.en[key],
      translated: translations[key] || `[missing: ${key}]`,
      complete: !!translations[key],
    }));
  };

  const currentLocaleInfo = locales.find(l => l.code === currentLocale);
  const isRTL = currentLocaleInfo?.rtl || false;

  const handleLocaleChange = (newLocale: LocaleCode) => {
    setCurrentLocale(newLocale);
  };

  return (
    <div className={`space-y-6 p-6 bg-nyra-surface rounded-lg ${isRTL ? 'dir-rtl' : ''}`}>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-gray-100">Language Settings</h2>
        <p className="text-sm text-gray-400">Localization & internationalization</p>
      </div>

      {/* Current Locale Display */}
      <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-2">
        <p className="text-xs text-gray-500 uppercase font-semibold">Current Locale</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-[#D4785C]">{currentLocaleInfo?.name}</p>
            <p className="text-xs text-gray-500 mt-1">Code: {currentLocale.toUpperCase()}</p>
          </div>
          {isRTL && (
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
          onChange={(e) => handleLocaleChange(e.target.value as LocaleCode)}
          className="w-full bg-[#1a1816] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 hover:border-gray-600 focus:outline-none focus:border-[#D4785C]"
        >
          {locales.map((locale) => (
            <option key={locale.code} value={locale.code}>
              {locale.name} ({locale.code})
            </option>
          ))}
        </select>
      </div>

      {/* RTL Indicator */}
      {isRTL && (
        <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-3">
          <p className="text-xs font-semibold text-purple-300">
            Right-to-Left Layout Active
          </p>
          <p className="text-xs text-purple-400 mt-1">
            Text direction and UI elements are mirrored for RTL languages.
          </p>
        </div>
      )}

      {/* Missing Translations Badge */}
      {missingCount > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3">
          <p className="text-xs font-semibold text-yellow-300">
            ⚠ {missingCount} Missing Translation{missingCount > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-yellow-400 mt-1">
            Some strings are not yet translated to {currentLocaleInfo?.name}.
          </p>
        </div>
      )}

      {/* Sample Translations */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <p className="text-xs font-semibold text-gray-400 uppercase">Sample Translations</p>
          <span className="text-xs text-gray-500">
            {samples.filter(s => s.complete).length} / {samples.length} complete
          </span>
        </div>

        <div className="space-y-2">
          {isLoading ? (
            <p className="text-gray-500 text-sm">Loading translations...</p>
          ) : samples.length > 0 ? (
            samples.map((sample) => (
              <div
                key={sample.key}
                className={`bg-[#1a1816] border rounded-lg p-3 space-y-1.5 ${
                  sample.complete ? 'border-gray-700' : 'border-yellow-700/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono text-gray-500">{sample.key}</p>
                  {!sample.complete && (
                    <span className="text-xs font-semibold text-yellow-400">missing</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">English</p>
                    <p className="text-sm text-gray-400 font-mono">{sample.en}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">{currentLocaleInfo?.name}</p>
                    <p className={`text-sm font-mono ${
                      sample.complete ? 'text-gray-200' : 'text-yellow-500/70 italic'
                    }`}>
                      {sample.translated}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm italic">No samples available</p>
          )}
        </div>
      </div>

      {/* Supported Locales Info */}
      <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Supported Languages</p>
        <div className="grid grid-cols-2 gap-2">
          {locales.map((locale) => (
            <div
              key={locale.code}
              className="text-xs text-gray-400 flex items-center justify-between p-2 bg-[#0d0b09] rounded"
            >
              <span>{locale.name}</span>
              <span className="text-gray-600 font-mono">{locale.code}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-sage/10 border border-sage/30 rounded-lg p-3">
        <p className="text-xs text-sage font-semibold mb-1">Localization Active</p>
        <p className="text-xs text-sage/80">
          Language changes apply to the entire application. Reload to see all changes.
        </p>
      </div>
    </div>
  );
}
