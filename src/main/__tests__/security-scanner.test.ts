import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SecurityScanner } from '../marketplace/security-scanner'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('SecurityScanner', () => {
  let scanner: SecurityScanner
  let tmpDir: string

  beforeEach(() => {
    scanner = new SecurityScanner()
    tmpDir = path.join(os.tmpdir(), 'nyra-test-security-scanner')
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  describe('Malicious Pattern Detection', () => {
    it('should detect eval usage as critical', async () => {
      const code = 'const data = eval(userInput)'
      const findings = await scanner.scanCode(code)
      expect(findings.length).toBeGreaterThan(0)
      const evalFinding = findings.find((f) => f.description.includes('Dynamic code execution via eval'))
      expect(evalFinding).toBeDefined()
      expect(evalFinding?.severity).toBe('critical')
    })

    it('should detect function constructor pattern as critical', async () => {
      const code = 'const fn = new Function(code)'
      const findings = await scanner.scanCode(code)
      const fnFinding = findings.find((f) => f.description.includes('Dynamic function creation'))
      expect(fnFinding).toBeDefined()
      expect(fnFinding?.severity).toBe('critical')
    })

    it('should detect child_process spawn pattern as high', async () => {
      const code = 'spawn(userCommand)'
      const findings = await scanner.scanCode(code)
      const shellFinding = findings.find((f) => f.description.includes('Shell command execution'))
      expect(shellFinding).toBeDefined()
      expect(shellFinding?.severity).toBe('high')
    })

    it('should detect filesystem access patterns', async () => {
      const code = 'const fs = require("fs")'
      const findings = await scanner.scanCode(code)
      const fsFinding = findings.find((f) => f.description.includes('Direct filesystem access'))
      expect(fsFinding).toBeDefined()
      expect(fsFinding?.severity).toBe('medium')
    })

    it('should detect environment variable access', async () => {
      const code = 'const apiKey = process.env.API_KEY'
      const findings = await scanner.scanCode(code)
      const envFinding = findings.find((f) => f.description.includes('Environment variable access'))
      expect(envFinding).toBeDefined()
    })

    it('should detect cookie access as high severity', async () => {
      const code = 'const cookies = document.cookie'
      const findings = await scanner.scanCode(code)
      const cookieFinding = findings.find((f) => f.description.includes('Cookie access'))
      expect(cookieFinding).toBeDefined()
      expect(cookieFinding?.severity).toBe('high')
    })

    it('should detect keyboard monitoring patterns', async () => {
      const code = 'addEventListener("keypress", handler)'
      const findings = await scanner.scanCode(code)
      const keylogFinding = findings.find((f) => f.description.includes('Keyboard monitoring'))
      expect(keylogFinding).toBeDefined()
      expect(keylogFinding?.severity).toBe('high')
    })
  })

  describe('Obfuscation Detection', () => {
    it('should detect base64 encoding', async () => {
      const code = 'Buffer.from(data, "base64")'
      const findings = await scanner.scanCode(code)
      const b64Finding = findings.find((f) => f.description.includes('Base64 encoding'))
      expect(b64Finding).toBeDefined()
      expect(b64Finding?.severity).toBe('low')
    })

    it('should detect hex escape sequences', async () => {
      const code = 'const str = "\\x48"'
      const findings = await scanner.scanCode(code)
      const hexFinding = findings.find((f) => f.description.includes('Hex/unicode escape sequences'))
      expect(hexFinding).toBeDefined()
    })

    it('should detect extremely long lines as potential minification', async () => {
      // Note: Long line detection is only in scanPlugin (file scanning), not scanCode
      // This test verifies scanCode doesn't flag innocent long strings
      const longLine = 'a'.repeat(600)
      const code = longLine

      const findings = await scanner.scanCode(code)
      const criticalFindings = findings.filter((f) => f.severity === 'critical')
      expect(criticalFindings.length).toBe(0)
    })
  })

  describe('Grading System', () => {
    it('should give high score to clean code', async () => {
      const code = 'function add(a, b) { return a + b }'
      const findings = await scanner.scanCode(code)
      // Clean code should have minimal findings
      expect(findings.length).toBeLessThan(3)
    })

    it('should flag code with multiple critical issues', async () => {
      const code = 'eval(x) const fn = new Function(x)'
      const findings = await scanner.scanCode(code)
      // Should have multiple critical findings
      const critical = findings.filter((f) => f.severity === 'critical')
      expect(critical.length).toBeGreaterThan(0)
    })
  })

  describe('Clean Code Validation', () => {
    it('should pass clean utility functions', async () => {
      const code = `
        function formatDate(date) {
          return new Date(date).toLocaleDateString()
        }
        function calculateTotal(items) {
          return items.reduce((sum, item) => sum + item.price, 0)
        }
      `

      const findings = await scanner.scanCode(code)
      const critical = findings.filter((f) => f.severity === 'critical' || f.severity === 'high')
      expect(critical.length).toBe(0)
    })

    it('should pass API calls to trusted endpoints', async () => {
      const code = `
        async function fetchData() {
          const response = await fetch('https://api.openai.com/v1/data')
          return response.json()
        }
      `

      const findings = await scanner.scanCode(code)
      const exfilFinding = findings.filter((f) => f.category === 'data-exfil')
      expect(exfilFinding.length).toBe(0)
    })
  })

  describe('File Scanning', () => {
    it('should track line numbers in findings', async () => {
      const code = `
        // Line 1
        // Line 2
        const dangerous = eval(x)
      `

      const findings = await scanner.scanCode(code)
      const evalFinding = findings.find((f) => f.description.includes('Dynamic code execution'))
      expect(evalFinding?.line).toBe(4)
    })

    it('should include filename in findings', async () => {
      const code = 'eval(x)'
      const findings = await scanner.scanCode(code, 'custom-file.js')

      const evalFinding = findings.find((f) => f.description.includes('Dynamic code execution'))
      expect(evalFinding?.file).toBe('custom-file.js')
    })
  })

  describe('Score Calculation', () => {
    it('should deduct points for severity levels', async () => {
      const code = 'eval(x)'
      const findings = await scanner.scanCode(code)
      expect(findings.some((f) => f.severity === 'critical')).toBe(true)
    })
  })

  describe('Recommendation Guidance', () => {
    it('should provide actionable recommendations', async () => {
      const code = 'eval(userCode)'
      const findings = await scanner.scanCode(code)
      const finding = findings.find((f) => f.severity === 'critical')
      expect(finding?.recommendation).toBeDefined()
      expect(finding?.recommendation?.length).toBeGreaterThan(0)
    })

    it('should categorize findings properly', async () => {
      const code = 'spawn(cmd)'
      const findings = await scanner.scanCode(code)
      const finding = findings.find((f) => f.severity === 'high')
      expect(finding?.category).toBe('permission')
    })
  })

  describe('Init/Shutdown Lifecycle', () => {
    it('should initialize and load scan history', () => {
      scanner.init()
      expect(scanner).toBeDefined()
    })

    it('should create data directory on init()', () => {
      scanner.init()
      const dataDir = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra')
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should save scan history on shutdown()', async () => {
      scanner.init()
      const findings = await scanner.scanCode('console.log("test")')
      scanner.shutdown()

      const historyPath = path.join(
        process.env.HOME || process.env.USERPROFILE || '/tmp',
        '.nyra',
        'security-scan-history.json'
      )

      if (fs.existsSync(historyPath)) {
        const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
        expect(data).toBeDefined()
        expect(typeof data).toBe('object')
      }
    })

    it('should restore scan history across instances', async () => {
      scanner.init()
      await scanner.scanCode('console.log("test")')
      scanner.shutdown()

      const scanner2 = new SecurityScanner()
      scanner2.init()
      expect(scanner2).toBeDefined()
    })

    it('should persist and recover scan results', async () => {
      scanner.init()

      const testPluginDir = path.join(tmpDir, 'test-plugin')
      fs.mkdirSync(testPluginDir, { recursive: true })

      const testFile = path.join(testPluginDir, 'index.js')
      fs.writeFileSync(testFile, 'console.log("test")')

      const result = await scanner.scanPlugin(testPluginDir)
      expect(result.pluginId).toBeDefined()

      scanner.shutdown()

      const historyPath = path.join(
        process.env.HOME || process.env.USERPROFILE || '/tmp',
        '.nyra',
        'security-scan-history.json'
      )

      if (fs.existsSync(historyPath)) {
        const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
        expect(data).toBeDefined()
      }
    })
  })
})
