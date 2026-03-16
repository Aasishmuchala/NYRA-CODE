/**
 * Plugin System — Loader & Lifecycle Manager
 * Manages plugin discovery, loading, installation, and registry
 */

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import * as vm from 'vm'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PluginTool {
  name: string
  description: string
  parameters: Record<string, { type: string; description: string; required?: boolean }>
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  icon?: string
  homepage?: string
  license?: string
  main?: string
  tools?: PluginTool[]
  permissions?: string[]
  mcpServers?: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }>
}

export interface PluginRegistry {
  plugins: Record<string, { enabled: boolean; installedAt: number; version: string }>
}

export interface InstalledPlugin {
  manifest: PluginManifest
  enabled: boolean
  loaded: boolean
  installedAt: number
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PLUGINS_DIR = path.join(app.getPath('userData'), 'plugins')
const PLUGIN_REGISTRY_PATH = path.join(app.getPath('userData'), 'nyra_plugin_registry.json')

// ── Ensure directories exist ───────────────────────────────────────────────────

function ensurePluginDirs(): void {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true })
  }
}

// ── Registry management ────────────────────────────────────────────────────────

function readRegistry(): PluginRegistry {
  if (!fs.existsSync(PLUGIN_REGISTRY_PATH)) {
    return { plugins: {} }
  }
  try {
    return JSON.parse(fs.readFileSync(PLUGIN_REGISTRY_PATH, 'utf8'))
  } catch {
    return { plugins: {} }
  }
}

function writeRegistry(registry: PluginRegistry): void {
  fs.writeFileSync(PLUGIN_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8')
}

// ── Manifest validation ────────────────────────────────────────────────────────

function validateManifest(manifest: unknown): manifest is PluginManifest {
  if (typeof manifest !== 'object' || manifest === null) return false
  const m = manifest as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.version === 'string' &&
    typeof m.description === 'string' &&
    typeof m.author === 'string'
  )
}

function readManifest(pluginDir: string): PluginManifest | null {
  const manifestPath = path.join(pluginDir, 'plugin.json')
  if (!fs.existsSync(manifestPath)) return null
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    if (validateManifest(data)) return data
  } catch (e) {
    console.error(`Failed to parse manifest for plugin at ${pluginDir}:`, e)
  }
  return null
}

// ── Plugin discovery ───────────────────────────────────────────────────────────

export function discoverPlugins(): PluginManifest[] {
  ensurePluginDirs()
  const manifests: PluginManifest[] = []

  if (!fs.existsSync(PLUGINS_DIR)) return manifests

  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pluginDir = path.join(PLUGINS_DIR, entry.name)
    const manifest = readManifest(pluginDir)
    if (manifest) {
      manifests.push(manifest)
    }
  }

  return manifests
}

// ── Plugin loading ─────────────────────────────────────────────────────────────

const loadedPlugins = new Map<string, { context: any; module: any }>()

export function loadPlugin(pluginId: string): boolean {
  if (loadedPlugins.has(pluginId)) return true

  const registry = readRegistry()
  const pluginEntry = registry.plugins[pluginId]
  if (!pluginEntry) {
    console.warn(`Plugin ${pluginId} not in registry`)
    return false
  }

  const manifests = discoverPlugins()
  const manifest = manifests.find(m => m.id === pluginId)
  if (!manifest) {
    console.warn(`Plugin manifest not found for ${pluginId}`)
    return false
  }

  const pluginDir = path.join(PLUGINS_DIR, pluginId)
  const mainFile = manifest.main || 'index.js'
  const mainPath = path.join(pluginDir, mainFile)

  if (!fs.existsSync(mainPath)) {
    console.warn(`Plugin entry point not found: ${mainPath}`)
    return false
  }

  try {
    const code = fs.readFileSync(mainPath, 'utf8')

    // Create sandbox with limited API
    const sandbox = {
      console: console,
      log: (...args: any[]) => console.log(`[${pluginId}]`, ...args),
      fetch: fetch,
      fs: {
        readFile: (filePath: string): Promise<string> => {
          const safePath = path.resolve(pluginDir, filePath)
          if (!safePath.startsWith(pluginDir)) {
            throw new Error('Path escape attempt')
          }
          return fs.promises.readFile(safePath, 'utf8')
        },
        writeFile: (filePath: string, content: string): Promise<void> => {
          const safePath = path.resolve(pluginDir, filePath)
          if (!safePath.startsWith(pluginDir)) {
            throw new Error('Path escape attempt')
          }
          return fs.promises.writeFile(safePath, content, 'utf8')
        },
      },
      env: {
        get: (key: string): string | undefined => {
          // Only allow access to plugin-specific env vars (prefixed with PLUGIN_)
          return process.env[`PLUGIN_${key}`]
        },
      },
      module: { exports: {} },
      require: (id: string) => {
        // Allow limited requires (json, path, etc.)
        if (id === 'path') return path
        if (id === 'os') return require('os')
        throw new Error(`Plugin cannot require '${id}'`)
      },
    }

    const script = new vm.Script(code, { filename: mainPath })
    const context = vm.createContext(sandbox)
    script.runInContext(context)

    const pluginModule = (sandbox as any).module.exports

    // Call activate hook if present
    if (typeof pluginModule.activate === 'function') {
      pluginModule.activate(sandbox)
    }

    loadedPlugins.set(pluginId, { context, module: pluginModule })
    console.log(`Plugin loaded: ${pluginId}`)
    return true
  } catch (e) {
    console.error(`Failed to load plugin ${pluginId}:`, e)
    return false
  }
}

export function unloadPlugin(pluginId: string): void {
  const plugin = loadedPlugins.get(pluginId)
  if (!plugin) return

  try {
    if (typeof plugin.module.deactivate === 'function') {
      plugin.module.deactivate()
    }
  } catch (e) {
    console.error(`Error during plugin deactivation for ${pluginId}:`, e)
  }

  loadedPlugins.delete(pluginId)
  console.log(`Plugin unloaded: ${pluginId}`)
}

// ── Plugin installation ────────────────────────────────────────────────────────

export async function installPlugin(source: string): Promise<boolean> {
  ensurePluginDirs()

  try {
    let _zipBuffer: Buffer

    // Detect if source is URL or local path
    if (source.startsWith('http://') || source.startsWith('https://')) {
      // Download from URL
      const response = await fetch(source)
      if (!response.ok) {
        console.error(`Failed to download plugin: ${response.statusText}`)
        return false
      }
      _zipBuffer = await response.arrayBuffer() as any as Buffer
    } else {
      // Load from local path
      if (!fs.existsSync(source)) {
        console.error(`Plugin source not found: ${source}`)
        return false
      }
      _zipBuffer = await fs.promises.readFile(source) as any as Buffer
    }

    // Check if it's a directory (unpacked plugin) or a zip
    if (fs.existsSync(source) && fs.statSync(source).isDirectory()) {
      // It's a directory - copy it directly
      const manifest = readManifest(source)
      if (!manifest) {
        console.error('No valid plugin.json manifest in directory')
        return false
      }

      const destDir = path.join(PLUGINS_DIR, manifest.id)
      // Copy directory recursively
      copyDirRecursive(source, destDir)

      // Register in registry
      const registry = readRegistry()
      registry.plugins[manifest.id] = {
        enabled: true,
        installedAt: Date.now(),
        version: manifest.version,
      }
      writeRegistry(registry)

      console.log(`Plugin installed: ${manifest.id}`)
      return true
    }

    // For zip files, we need to extract them
    // Node.js doesn't have built-in zip support, so we'll skip zip support for now
    // In a production app, you'd use a library like 'adm-zip' or 'unzipper'
    console.warn('Zip installation not yet supported; only directory or URL downloads')
    return false
  } catch (e) {
    console.error('Plugin installation failed:', e)
    return false
  }
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// ── Plugin removal ─────────────────────────────────────────────────────────────

export function removePlugin(pluginId: string): boolean {
  try {
    // Unload if loaded
    unloadPlugin(pluginId)

    // Remove directory
    const pluginDir = path.join(PLUGINS_DIR, pluginId)
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true })
    }

    // Update registry
    const registry = readRegistry()
    delete registry.plugins[pluginId]
    writeRegistry(registry)

    console.log(`Plugin removed: ${pluginId}`)
    return true
  } catch (e) {
    console.error(`Failed to remove plugin ${pluginId}:`, e)
    return false
  }
}

// ── Enable/Disable ─────────────────────────────────────────────────────────────

export function enablePlugin(pluginId: string): void {
  const registry = readRegistry()
  if (registry.plugins[pluginId]) {
    registry.plugins[pluginId].enabled = true
    writeRegistry(registry)
    console.log(`Plugin enabled: ${pluginId}`)
  }
}

export function disablePlugin(pluginId: string): void {
  const registry = readRegistry()
  if (registry.plugins[pluginId]) {
    registry.plugins[pluginId].enabled = false
    unloadPlugin(pluginId)
    writeRegistry(registry)
    console.log(`Plugin disabled: ${pluginId}`)
  }
}

// ── Query plugins ──────────────────────────────────────────────────────────────

export function getInstalledPlugins(): InstalledPlugin[] {
  const manifests = discoverPlugins()
  const registry = readRegistry()

  return manifests.map(manifest => ({
    manifest,
    enabled: registry.plugins[manifest.id]?.enabled ?? true,
    loaded: loadedPlugins.has(manifest.id),
    installedAt: registry.plugins[manifest.id]?.installedAt ?? Date.now(),
  }))
}

export function getPluginTools(pluginId: string): PluginTool[] {
  const plugins = getInstalledPlugins()
  const plugin = plugins.find(p => p.manifest.id === pluginId)
  return plugin?.manifest.tools ?? []
}

export function getLoadedPlugin(pluginId: string): any | null {
  const plugin = loadedPlugins.get(pluginId)
  return plugin?.module ?? null
}
