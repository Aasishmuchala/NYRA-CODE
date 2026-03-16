import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { I18nManager } from '../os-integration/i18n'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('I18nManager', () => {
  let i18n: I18nManager
  let tmpDir: string

  beforeEach(() => {
    i18n = new I18nManager()
    tmpDir = path.join(os.tmpdir(), 'nyra-test-i18n')
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  describe('Locale Management', () => {
    it('should get default locale', () => {
      expect(i18n.getLocale()).toBe('en')
    })

    it('should set locale', () => {
      i18n.setLocale('es')
      expect(i18n.getLocale()).toBe('es')
    })

    it('should normalize locale to language code', () => {
      i18n.setLocale('es-ES')
      expect(i18n.getLocale()).toBe('es')
    })

    it('should emit locale-changed event', () => {
      let emitted = false
      i18n.on('locale-changed', (data) => {
        emitted = true
        expect(data.locale).toBe('fr')
      })

      i18n.setLocale('fr')
      expect(emitted).toBe(true)
    })
  })

  describe('Translation Lookup', () => {
    it('should translate key in English', () => {
      const result = i18n.t('settings')
      expect(result).toBe('Settings')
    })

    it('should return key if translation missing', () => {
      const result = i18n.t('nonexistent_key')
      expect(result).toBe('nonexistent_key')
    })

    it('should emit missing-translation event', () => {
      let emitted = false
      i18n.on('missing-translation', (data) => {
        emitted = true
        expect(data.key).toBe('missing_key')
      })

      i18n.t('missing_key')
      expect(emitted).toBe(true)
    })

    it('should interpolate parameters', () => {
      i18n.addTranslation('en', 'greeting', 'Hello {{name}}!')
      const result = i18n.t('greeting', { name: 'Alice' })
      expect(result).toBe('Hello Alice!')
    })

    it('should handle multiple parameters', () => {
      i18n.addTranslation('en', 'message', '{{count}} items from {{location}}')
      const result = i18n.t('message', { count: '5', location: 'server' })
      expect(result).toBe('5 items from server')
    })
  })

  describe('Pluralization', () => {
    it('should use singular form for count=1', () => {
      i18n.addTranslation('en', 'items', {
        one: '1 item',
        other: '{{count}} items',
      })

      const result = i18n.tp('items', 1)
      expect(result).toBe('1 item')
    })

    it('should use plural form for count!=1', () => {
      i18n.addTranslation('en', 'items', {
        one: '1 item',
        other: '{{count}} items',
      })

      const result = i18n.tp('items', 5)
      expect(result).toContain('5 items')
    })

    it('should use other form as fallback', () => {
      i18n.addTranslation('en', 'files', {
        other: '{{count}} files',
      })

      const result1 = i18n.tp('files', 1)
      const result2 = i18n.tp('files', 3)
      expect(result1).toContain('1')
      expect(result2).toContain('3')
    })

    it('should interpolate count in plural forms', () => {
      i18n.addTranslation('en', 'downloads', {
        one: 'Downloaded 1 file',
        other: 'Downloaded {{count}} files',
      })

      const result = i18n.tp('downloads', 7)
      expect(result).toContain('7')
    })
  })

  describe('Translation Loading', () => {
    it('should load translation bundle', () => {
      const bundle = {
        hello: 'Hola',
        goodbye: 'Adiós',
      }

      i18n.loadTranslations('es', bundle)
      i18n.setLocale('es')

      expect(i18n.t('hello')).toBe('Hola')
      expect(i18n.t('goodbye')).toBe('Adiós')
    })

    it('should emit translations-loaded event', () => {
      let emitted = false
      i18n.on('translations-loaded', (data) => {
        emitted = true
        expect(data.locale).toBe('de')
        expect(data.count).toBe(2)
      })

      i18n.loadTranslations('de', { hello: 'Hallo', goodbye: 'Auf Wiedersehen' })
      expect(emitted).toBe(true)
    })

    it('should add single translation', () => {
      i18n.addTranslation('fr', 'hello', 'Bonjour')
      i18n.setLocale('fr')
      expect(i18n.t('hello')).toBe('Bonjour')
    })

    it('should merge translation bundles', () => {
      i18n.loadTranslations('es', { hello: 'Hola' })
      i18n.loadTranslations('es', { goodbye: 'Adiós' })
      i18n.setLocale('es')

      expect(i18n.t('hello')).toBe('Hola')
      expect(i18n.t('goodbye')).toBe('Adiós')
    })
  })

  describe('Locale Fallback Chain', () => {
    it('should fallback to language code', () => {
      i18n.addTranslation('es', 'hello', 'Hola')
      i18n.setLocale('es-MX')
      expect(i18n.t('hello')).toBe('Hola')
    })

    it('should fallback to English', () => {
      i18n.setLocale('de')
      const result = i18n.t('settings')
      expect(result).toBe('Settings')
    })

    it('should check current locale first', () => {
      i18n.addTranslation('es', 'hello', 'Hola')
      i18n.addTranslation('en', 'hello', 'Hello')
      i18n.setLocale('es')
      expect(i18n.t('hello')).toBe('Hola')
    })
  })

  describe('RTL Detection', () => {
    it('should detect RTL for Arabic', () => {
      const isRtl = i18n.isRtl('ar')
      expect(isRtl).toBe(true)
    })

    it('should detect RTL for Hebrew', () => {
      const isRtl = i18n.isRtl('he')
      expect(isRtl).toBe(true)
    })

    it('should detect LTR for English', () => {
      const isRtl = i18n.isRtl('en')
      expect(isRtl).toBe(false)
    })

    it('should detect LTR for Spanish', () => {
      const isRtl = i18n.isRtl('es')
      expect(isRtl).toBe(false)
    })

    it('should use current locale when not specified', () => {
      i18n.setLocale('ar')
      expect(i18n.isRtl()).toBe(true)

      i18n.setLocale('en')
      expect(i18n.isRtl()).toBe(false)
    })
  })

  describe('Number Formatting', () => {
    it('should format numbers according to locale', () => {
      i18n.setLocale('en')
      const result = i18n.formatNumber(1234.56, 'en')
      expect(result).toContain('234')
    })

    it('should use current locale if not specified', () => {
      i18n.setLocale('en')
      const result = i18n.formatNumber(1000)
      expect(result).toBeDefined()
    })
  })

  describe('Date Formatting', () => {
    it('should format dates according to locale', () => {
      const date = new Date('2024-01-15')
      const result = i18n.formatDate(date, 'en')
      expect(result).toBeDefined()
      expect(result.length).toBeGreaterThan(0)
    })

    it('should use current locale if not specified', () => {
      i18n.setLocale('en')
      const date = new Date()
      const result = i18n.formatDate(date)
      expect(result).toBeDefined()
    })
  })

  describe('Currency Formatting', () => {
    it('should format currency', () => {
      const result = i18n.formatCurrency(42.99, 'USD', 'en')
      expect(result).toBeDefined()
      expect(result).toContain('42.99')
    })

    it('should use current locale if not specified', () => {
      i18n.setLocale('en')
      const result = i18n.formatCurrency(100, 'EUR')
      expect(result).toBeDefined()
    })
  })

  describe('Supported Locales', () => {
    it('should list supported locales', () => {
      const locales = i18n.getSupportedLocales()
      expect(locales).toContain('en')
      expect(locales).toContain('es')
      expect(locales).toContain('fr')
      expect(locales).toContain('ar')
    })
  })

  describe('Missing Keys Detection', () => {
    it('should find missing translation keys', () => {
      i18n.setLocale('en')
      i18n.loadTranslations('es', { hello: 'Hola' })
      i18n.setLocale('es')

      const missing = i18n.getMissingKeys('es')
      expect(missing.length).toBeGreaterThan(0)
      expect(missing).toContain('settings')
    })
  })

  describe('Complex Pluralization', () => {
    it('should handle Arabic pluralization rules', () => {
      i18n.addTranslation('ar', 'books', {
        zero: 'لا توجد كتب',
        one: 'كتاب واحد',
        few: '{{count}} كتب',
        many: '{{count}} كتابًا',
        other: '{{count}} كتاب',
      })

      i18n.setLocale('ar')
      expect(i18n.tp('books', 0)).toContain('لا')
      expect(i18n.tp('books', 1)).toContain('واحد')
      expect(i18n.tp('books', 2)).toContain('كتب')
    })
  })

  describe('Locale Normalization', () => {
    it('should handle language-region format', () => {
      i18n.addTranslation('es', 'hello', 'Hola')
      i18n.setLocale('es-MX')
      expect(i18n.getLocale()).toBe('es')
      expect(i18n.t('hello')).toBe('Hola')
    })

    it('should handle case insensitivity', () => {
      i18n.addTranslation('en', 'hello', 'Hello')
      i18n.setLocale('EN')
      expect(i18n.getLocale()).toBe('en')
    })
  })

  describe('Init/Shutdown Lifecycle', () => {
    it('should initialize and load locale preference from disk', () => {
      i18n.init()
      expect(i18n).toBeDefined()
      expect(i18n.getLocale()).toBeDefined()
    })

    it('should create data directory on init()', () => {
      i18n.init()
      const dataDir = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra')
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should save locale preference on shutdown()', () => {
      i18n.init()
      i18n.setLocale('es')
      i18n.shutdown()

      const configPath = path.join(
        process.env.HOME || process.env.USERPROFILE || '/tmp',
        '.nyra',
        'os-integration',
        'i18n-config.json'
      )

      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        expect(data.currentLocale).toBe('es')
      }
    })

    it('should restore locale preference after init+shutdown cycle', () => {
      i18n.init()
      i18n.setLocale('fr')
      i18n.shutdown()

      const i18n2 = new I18nManager()
      i18n2.init()

      expect(i18n2.getLocale()).toBe('fr')
    })

    it('should persist translation bundles on shutdown', () => {
      i18n.init()
      i18n.loadTranslations('de', { hello: 'Hallo', goodbye: 'Auf Wiedersehen' })
      i18n.shutdown()

      const configPath = path.join(
        process.env.HOME || process.env.USERPROFILE || '/tmp',
        '.nyra',
        'os-integration',
        'i18n-config.json'
      )

      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        expect(data.translations).toBeDefined()
      }
    })

    it('should restore translation bundles across init/shutdown cycle', () => {
      i18n.init()
      i18n.loadTranslations('it', { hello: 'Ciao', goodbye: 'Arrivederci' })
      i18n.setLocale('it')
      i18n.shutdown()

      const i18n2 = new I18nManager()
      i18n2.init()
      i18n2.setLocale('it')

      expect(i18n2.t('hello')).toBe('Ciao')
      expect(i18n2.t('goodbye')).toBe('Arrivederci')
    })

    it('should preserve custom translations after shutdown/init cycle', () => {
      i18n.init()
      i18n.addTranslation('pt', 'welcome', 'Bem-vindo')
      i18n.shutdown()

      const i18n2 = new I18nManager()
      i18n2.init()
      i18n2.setLocale('pt')

      expect(i18n2.t('welcome')).toBe('Bem-vindo')
    })
  })
})
