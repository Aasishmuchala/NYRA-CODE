import * as fs from 'fs'
import * as path from 'path'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface ScanIssue {
  severity: Severity
  code: string
  message: string
  package?: string
  file?: string
  line?: number
}

export interface ScanReport {
  pluginId: string
  timestamp: number
  passed: boolean
  grade: Grade
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    info: number
  }
  issues: ScanIssue[]
  dependencies: {
    safe: string[]
    warned: string[]
    malicious: string[]
  }
  licenses: {
    compatible: string[]
    incompatible: string[]
    unknown: string[]
  }
}

const MALICIOUS_PACKAGES = new Set([
  'event-stream',
  'node-ipc',
  'ua-parser-js',
  'colors',
  'faker',
  'tslib',
  'http-cache-semantics',
  'npm',
  'sanitize-html',
  'pac-resolver',
])

const COMPATIBLE_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
])

const INCOMPATIBLE_LICENSES = new Set([
  'GPL',
  'GPL-2.0',
  'GPL-3.0',
  'AGPL',
  'AGPL-3.0',
  'SSPL',
])

/**
 * NyraGuard: Dependency scanner for marketplace plugins
 * Scans for malicious packages, unsafe code patterns, and license issues
 */
export class NyraGuard {
  private issues: ScanIssue[] = []
  private currentPluginId: string = ''

  /**
   * Scan a plugin directory
   */
  scanPlugin(pluginDir: string): ScanReport {
    this.issues = []
    
    // Extract pluginId from directory path
    this.currentPluginId = path.basename(pluginDir)

    const packageJsonPath = path.join(pluginDir, 'package.json')
    if (!fs.existsSync(packageJsonPath)) {
      return this.generateFailureReport('package.json not found')
    }

    let packageJson: any
    try {
      const content = fs.readFileSync(packageJsonPath, 'utf-8')
      packageJson = JSON.parse(content)
    } catch (err) {
      return this.generateFailureReport('Invalid package.json')
    }

    // Scan dependencies
    this.scanDependencies(packageJson)

    // Scan code for unsafe patterns
    const srcDir = path.join(pluginDir, 'src')
    if (fs.existsSync(srcDir)) {
      this.scanCodeDirectory(srcDir)
    }

    // Scan licenses
    this.scanLicenses(packageJson)

    return this.generateReport()
  }

  /**
   * Scan dependencies for malicious packages and unsafe versions
   */
  scanDependencies(packageJson: any): void {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.optionalDependencies,
    }

    for (const [pkgName, version] of Object.entries(allDeps)) {
      // Check for malicious packages
      if (MALICIOUS_PACKAGES.has(pkgName)) {
        this.issues.push({
          severity: 'critical',
          code: 'MALICIOUS_PACKAGE',
          message: `Known malicious package detected: ${pkgName}`,
          package: pkgName,
        })
        continue
      }

      // Check version pinning
      const versionStr = String(version)
      if (versionStr.startsWith('^') || versionStr.startsWith('~')) {
        this.issues.push({
          severity: 'high',
          code: 'UNPINNED_VERSION',
          message: `Version not pinned for ${pkgName}: "${versionStr}" (use exact version)`,
          package: pkgName,
        })
      }

      // Warn on very old or prerelease versions
      if (versionStr.includes('alpha') || versionStr.includes('beta') || versionStr.includes('rc')) {
        this.issues.push({
          severity: 'medium',
          code: 'PRERELEASE_VERSION',
          message: `Prerelease version for ${pkgName}: "${versionStr}"`,
          package: pkgName,
        })
      }
    }
  }

  /**
   * Scan code files for unsafe patterns
   */
  private scanCodeDirectory(dir: string): void {
    const files = this.getAllFiles(dir)
    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.tsx')) {
        this.scanCode([file])
      }
    }
  }

  /**
   * Scan code for dangerous patterns
   */
  scanCode(files: string[]): void {
    for (const file of files) {
      if (!fs.existsSync(file)) {
        continue
      }

      try {
        const content = fs.readFileSync(file, 'utf-8')
        const lines = content.split('\n')

        lines.forEach((line, idx) => {
          const lineNum = idx + 1

          // Detect eval()
          if (/\beval\s*\(/.test(line)) {
            this.issues.push({
              severity: 'critical',
              code: 'EVAL_USAGE',
              message: 'Use of eval() detected - potential code injection',
              file,
              line: lineNum,
            })
          }

          // Detect Function constructor
          if (/new\s+Function\s*\(/.test(line)) {
            this.issues.push({
              severity: 'critical',
              code: 'FUNCTION_CONSTRUCTOR',
              message: 'Function constructor detected - potential code injection',
              file,
              line: lineNum,
            })
          }

          // Detect child_process usage
          if (/require\(['"]child_process['"]\)|from\s+['"]child_process['"]/.test(line)) {
            this.issues.push({
              severity: 'high',
              code: 'CHILD_PROCESS',
              message: 'child_process module imported - may execute system commands',
              file,
              line: lineNum,
            })
          }

          // Detect fs.write outside expected patterns
          if (/fs\.write|fs\.writeFile/.test(line) && !line.includes('// allowed')) {
            this.issues.push({
              severity: 'high',
              code: 'UNSAFE_FS_WRITE',
              message: 'File system write detected - should use sandbox directory',
              file,
              line: lineNum,
            })
          }

          // Detect crypto mining patterns
          if (/worker|Worker|pool|Pool/.test(line) && /crypto|hash|sha256|blake2/.test(content)) {
            this.issues.push({
              severity: 'high',
              code: 'POTENTIAL_CRYPTO_MINING',
              message: 'Potential crypto-mining code detected',
              file,
              line: lineNum,
            })
          }

          // Detect data exfiltration patterns
          if (/fetch|XMLHttpRequest|WebSocket/.test(line) && /password|token|secret|credential|key/.test(content)) {
            this.issues.push({
              severity: 'high',
              code: 'DATA_EXFILTRATION_RISK',
              message: 'Potential credential/sensitive data exfiltration',
              file,
              line: lineNum,
            })
          }
        })
      } catch (err) {
        this.issues.push({
          severity: 'low',
          code: 'FILE_READ_ERROR',
          message: `Could not read file: ${file}`,
          file,
        })
      }
    }
  }

  /**
   * Scan licenses for compatibility
   */
  private scanLicenses(packageJson: any): void {
    const license = packageJson.license || 'UNLICENSED'

    if (COMPATIBLE_LICENSES.has(license)) {
      // OK
    } else if (INCOMPATIBLE_LICENSES.has(license)) {
      this.issues.push({
        severity: 'high',
        code: 'INCOMPATIBLE_LICENSE',
        message: `License "${license}" is incompatible with NYRA`,
      })
    } else if (license !== 'UNLICENSED') {
      this.issues.push({
        severity: 'medium',
        code: 'UNKNOWN_LICENSE',
        message: `Unknown license: "${license}"`,
      })
    }
  }

  /**
   * Generate a scan report
   */
  generateReport(): ScanReport {
    const summary = {
      critical: this.issues.filter(i => i.severity === 'critical').length,
      high: this.issues.filter(i => i.severity === 'high').length,
      medium: this.issues.filter(i => i.severity === 'medium').length,
      low: this.issues.filter(i => i.severity === 'low').length,
      info: this.issues.filter(i => i.severity === 'info').length,
    }

    const passed = summary.critical === 0

    const grade = this.calculateGrade(summary)

    const dependencies = {
      safe: [],
      warned: [],
      malicious: [],
    }

    const licenses = {
      compatible: [],
      incompatible: [],
      unknown: [],
    }

    return {
      pluginId: this.currentPluginId,
      timestamp: Date.now(),
      passed,
      grade,
      summary,
      issues: this.issues,
      dependencies,
      licenses,
    }
  }

  /**
   * Generate a failure report
   */
  private generateFailureReport(reason: string): ScanReport {
    return {
      pluginId: this.currentPluginId,
      timestamp: Date.now(),
      passed: false,
      grade: 'F',
      summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      issues: [
        {
          severity: 'critical',
          code: 'SCAN_FAILURE',
          message: reason,
        },
      ],
      dependencies: { safe: [], warned: [], malicious: [] },
      licenses: { compatible: [], incompatible: [], unknown: [] },
    }
  }

  /**
   * Calculate grade (A-F) based on issues
   */
  private calculateGrade(summary: ScanReport['summary']): Grade {
    const totalIssues = summary.critical + summary.high + summary.medium + summary.low + summary.info
    const score = 100 - (summary.critical * 50 + summary.high * 10 + summary.medium * 5 + summary.low * 1)

    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 70) return 'C'
    if (score >= 60) return 'D'
    return 'F'
  }

  /**
   * Get all files recursively
   */
  private getAllFiles(dir: string): string[] {
    const files: string[] = []

    const traverse = (currentDir: string): void => {
      try {
        const entries = fs.readdirSync(currentDir)
        for (const entry of entries) {
          if (entry.startsWith('.')) continue

          const fullPath = path.join(currentDir, entry)
          const stat = fs.statSync(fullPath)

          if (stat.isDirectory()) {
            if (entry !== 'node_modules' && entry !== '.git' && entry !== 'dist') {
              traverse(fullPath)
            }
          } else {
            files.push(fullPath)
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    traverse(dir)
    return files
  }
}

// Export singleton instance
export const nyraGuard = new NyraGuard()
