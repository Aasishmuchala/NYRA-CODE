/**
 * Agent Marketplace Security Scanner
 *
 * Scans plugins and skills before marketplace listing or installation.
 * Detects:
 * - Malicious patterns (code injection, dangerous APIs)
 * - Dependency vulnerabilities (npm audit equivalent)
 * - Excessive permissions (filesystem, network, shell)
 * - Obfuscated code
 * - Data exfiltration patterns
 */

export interface ScanResult {
  pluginId: string
  score: number           // 0-100, higher = safer
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  findings: SecurityFinding[]
  scannedFiles: number
  scannedAt: number
  durationMs: number
}

export interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: 'malicious-code' | 'vulnerability' | 'permission' | 'obfuscation' | 'data-exfil' | 'best-practice'
  file: string
  line?: number
  description: string
  recommendation: string
}

// Patterns that indicate potentially malicious code
const MALICIOUS_PATTERNS: Array<{ pattern: RegExp; severity: SecurityFinding['severity']; category: SecurityFinding['category']; description: string; recommendation: string }> = [
  { pattern: /\beval\s*\(/, severity: 'critical', category: 'malicious-code', description: 'Dynamic code execution via eval()', recommendation: 'Remove eval() and use static code instead' },
  { pattern: /new\s+Function\s*\(/, severity: 'critical', category: 'malicious-code', description: 'Dynamic function creation', recommendation: 'Use static function definitions' },
  { pattern: /child_process|execSync|exec\s*\(|spawn\s*\(/, severity: 'high', category: 'permission', description: 'Shell command execution', recommendation: 'Declare shell access in permissions manifest' },
  { pattern: /require\s*\(\s*['"]fs['"]|import\s+.*from\s+['"]fs['"]/, severity: 'medium', category: 'permission', description: 'Direct filesystem access', recommendation: 'Use the sandbox filesystem API instead' },
  { pattern: /https?:\/\/(?!api\.(openai|anthropic|google|github|telegram|discord|slack)\.)[\w.-]+/, severity: 'medium', category: 'data-exfil', description: 'Network request to non-standard endpoint', recommendation: 'Declare all network endpoints in permissions' },
  { pattern: /process\.env/, severity: 'medium', category: 'data-exfil', description: 'Environment variable access', recommendation: 'Access secrets through the plugin config API, not env vars' },
  { pattern: /Buffer\.from\(.*,\s*['"]base64['"]/, severity: 'low', category: 'obfuscation', description: 'Base64 encoding/decoding (potential obfuscation)', recommendation: 'Document what data is being encoded' },
  { pattern: /\\x[0-9a-f]{2}|\\u[0-9a-f]{4}/i, severity: 'low', category: 'obfuscation', description: 'Hex/unicode escape sequences (potential obfuscation)', recommendation: 'Use plain text strings' },
  { pattern: /atob\s*\(|btoa\s*\(/, severity: 'low', category: 'obfuscation', description: 'Browser base64 functions', recommendation: 'Document encoded data purpose' },
  { pattern: /crypto\.createCipher|crypto\.createDecipher/, severity: 'medium', category: 'malicious-code', description: 'Deprecated crypto functions (weak encryption)', recommendation: 'Use crypto.createCipheriv with a proper IV' },
  { pattern: /\.cookie|document\.cookie/, severity: 'high', category: 'data-exfil', description: 'Cookie access', recommendation: 'Plugins should not access browser cookies' },
  { pattern: /keylog|keypress|keyboard/, severity: 'high', category: 'malicious-code', description: 'Keyboard monitoring pattern', recommendation: 'Remove keyboard monitoring code' },
]

export class SecurityScanner {
  private scanHistoryMap: Map<string, ScanResult[]> = new Map()
  private dataDir: string

  constructor() {
    this.dataDir = require('path').join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra')
  }

  /**
   * Initialize: load scan history from disk
   */
  init(): void {
    try {
      const fs = require('fs')
      const path = require('path')
      fs.mkdirSync(this.dataDir, { recursive: true })

      const historyPath = path.join(this.dataDir, 'security-scan-history.json')
      if (fs.existsSync(historyPath)) {
        const data = fs.readFileSync(historyPath, 'utf-8')
        const history = JSON.parse(data) as Record<string, ScanResult[]>
        for (const [pluginId, results] of Object.entries(history)) {
          this.scanHistoryMap.set(pluginId, results)
        }
        console.log('[SecurityScanner] Loaded scan history for', this.scanHistoryMap.size, 'plugins')
      }
    } catch (err) {
      console.error('[SecurityScanner] Failed to load scan history:', err)
    }
  }

  /**
   * Shutdown: save scan history to disk
   */
  shutdown(): void {
    try {
      const fs = require('fs')
      const path = require('path')
      fs.mkdirSync(this.dataDir, { recursive: true })

      const historyPath = path.join(this.dataDir, 'security-scan-history.json')
      const historyObj: Record<string, ScanResult[]> = {}

      Array.from(this.scanHistoryMap.entries()).forEach(([pluginId, results]) => {
        historyObj[pluginId] = results
      })

      fs.writeFileSync(historyPath, JSON.stringify(historyObj, null, 2), 'utf-8')
      console.log('[SecurityScanner] Saved scan history for', this.scanHistoryMap.size, 'plugins')
    } catch (err) {
      console.error('[SecurityScanner] Failed to save scan history:', err)
    }
  }

  async scanPlugin(pluginDir: string): Promise<ScanResult> {
    const start = Date.now()
    const fs = require('fs')
    const path = require('path')
    const findings: SecurityFinding[] = []
    let filesScanned = 0

    // Recursively find all JS/TS files
    const files = this.findFiles(pluginDir, ['.ts', '.js', '.tsx', '.jsx', '.mjs'])

    for (const file of files) {
      filesScanned++
      try {
        const content = fs.readFileSync(file, 'utf8')
        const lines = content.split('\n')
        const relPath = path.relative(pluginDir, file)

        // Check each malicious pattern
        for (const check of MALICIOUS_PATTERNS) {
          for (let i = 0; i < lines.length; i++) {
            if (check.pattern.test(lines[i])) {
              findings.push({
                severity: check.severity,
                category: check.category,
                file: relPath,
                line: i + 1,
                description: check.description,
                recommendation: check.recommendation,
              })
            }
          }
        }

        // Check for minified/obfuscated code (very long lines)
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].length > 500) {
            findings.push({
              severity: 'medium',
              category: 'obfuscation',
              file: relPath,
              line: i + 1,
              description: `Extremely long line (${lines[i].length} chars) — possible minified/obfuscated code`,
              recommendation: 'Provide readable source code',
            })
          }
        }
      } catch (err) {
        findings.push({
          severity: 'info',
          category: 'best-practice',
          file: file,
          description: `Could not read file: ${err}`,
          recommendation: 'Ensure all files are readable',
        })
      }
    }

    // Check for package.json dependencies
    const pkgPath = path.join(pluginDir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        const deps = { ...pkg.dependencies, ...pkg.devDependencies }

        // Flag known risky packages
        const riskyPackages = ['node-ipc', 'event-stream', 'flatmap-stream', 'ua-parser-js']
        for (const [name] of Object.entries(deps)) {
          if (riskyPackages.includes(name)) {
            findings.push({
              severity: 'critical',
              category: 'vulnerability',
              file: 'package.json',
              description: `Known supply-chain attack package: ${name}`,
              recommendation: `Remove ${name} and use a trusted alternative`,
            })
          }
        }
      } catch {}
    }

    // Calculate score
    const score = this.calculateScore(findings)
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F'

    const pluginId = path.basename(pluginDir)
    const result: ScanResult = {
      pluginId,
      score,
      grade,
      findings,
      scannedFiles: filesScanned,
      scannedAt: Date.now(),
      durationMs: Date.now() - start,
    }

    // Persist scan result to history
    if (!this.scanHistoryMap.has(pluginId)) {
      this.scanHistoryMap.set(pluginId, [])
    }
    this.scanHistoryMap.get(pluginId)!.push(result)

    return result
  }

  async scanCode(code: string, filename = 'inline'): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = []
    const lines = code.split('\n')

    for (const check of MALICIOUS_PATTERNS) {
      for (let i = 0; i < lines.length; i++) {
        if (check.pattern.test(lines[i])) {
          findings.push({
            severity: check.severity,
            category: check.category,
            file: filename,
            line: i + 1,
            description: check.description,
            recommendation: check.recommendation,
          })
        }
      }
    }

    return findings
  }

  private calculateScore(findings: SecurityFinding[]): number {
    let score = 100
    for (const f of findings) {
      switch (f.severity) {
        case 'critical': score -= 25; break
        case 'high': score -= 15; break
        case 'medium': score -= 8; break
        case 'low': score -= 3; break
        case 'info': score -= 1; break
      }
    }
    return Math.max(0, score)
  }

  private findFiles(dir: string, extensions: string[]): string[] {
    const fs = require('fs')
    const path = require('path')
    const results: string[] = []

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        if (entry.isDirectory()) {
          results.push(...this.findFiles(full, extensions))
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          results.push(full)
        }
      }
    } catch {}

    return results
  }
}

export const securityScanner = new SecurityScanner()

