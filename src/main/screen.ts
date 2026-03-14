/**
 * Screen Capture Engine — uses desktopCapturer API to capture screenshots
 * Returns base64 PNG images suitable for AI vision models
 * Handles multi-monitor setups and window-specific captures
 */
import { desktopCapturer, nativeImage, BrowserWindow } from 'electron'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ScreenCapture {
  base64: string
  width: number
  height: number
  timestamp: number
}

export interface ScreenSource {
  id: string
  name: string
  type: 'screen' | 'window'
}

export interface CaptureOptions {
  width?: number
  height?: number
}

// ── State ──────────────────────────────────────────────────────────────────────
let continuousCaptureInterval: NodeJS.Timeout | null = null
let continuousCaptureCallback: ((capture: ScreenCapture | null) => void) | null = null

// ── Utilities ──────────────────────────────────────────────────────────────────
/**
 * Resize image to max 1024px on longest side for AI context efficiency
 */
function resizeForAI(img: typeof nativeImage): typeof nativeImage {
  const size = img.getSize()
  const maxDim = 1024
  const longest = Math.max(size.width, size.height)

  if (longest <= maxDim) return img

  const scale = maxDim / longest
  const newWidth = Math.round(size.width * scale)
  const newHeight = Math.round(size.height * scale)

  return img.resize({ width: newWidth, height: newHeight, quality: 'good' })
}

/**
 * Convert nativeImage to base64 PNG string
 */
function imageToBase64(img: typeof nativeImage): string {
  return img.toPNG().toString('base64')
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Capture a single screenshot of the primary screen
 */
export async function captureScreen(): Promise<ScreenCapture | null> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 }
    })

    if (sources.length === 0) {
      console.warn('[screen] No screen sources available')
      return null
    }

    // Capture the primary screen (first source)
    const primaryScreen = sources[0]
    const screenshot = await primaryScreen.getMediaSource().getDisplayMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: primaryScreen.id
        }
      }
    } as any)

    // For Electron 29, use desktopCapturer directly with proper thumbnail capture
    const capturedSources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    })

    if (capturedSources.length === 0) {
      console.warn('[screen] Failed to get capture sources')
      return null
    }

    const thumbnail = capturedSources[0].thumbnail
    const resized = resizeForAI(thumbnail)
    const size = resized.getSize()

    return {
      base64: imageToBase64(resized),
      width: size.width,
      height: size.height,
      timestamp: Date.now()
    }
  } catch (err) {
    console.warn('[screen] Capture failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Capture a specific window by title
 */
export async function captureWindow(windowTitle: string): Promise<ScreenCapture | null> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1920, height: 1080 }
    })

    const targetWindow = sources.find((s) => s.name === windowTitle)

    if (!targetWindow) {
      console.warn(`[screen] Window not found: "${windowTitle}"`)
      return null
    }

    const thumbnail = targetWindow.thumbnail
    const resized = resizeForAI(thumbnail)
    const size = resized.getSize()

    return {
      base64: imageToBase64(resized),
      width: size.width,
      height: size.height,
      timestamp: Date.now()
    }
  } catch (err) {
    console.warn('[screen] Window capture failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Start periodic screen capture at specified interval
 * Returns a stop function
 */
export function startContinuousCapture(
  intervalMs: number,
  callback: (capture: ScreenCapture | null) => void
): () => void {
  if (continuousCaptureInterval) {
    stopContinuousCapture()
  }

  continuousCaptureCallback = callback

  continuousCaptureInterval = setInterval(async () => {
    const capture = await captureScreen()
    if (continuousCaptureCallback) {
      continuousCaptureCallback(capture)
    }
  }, intervalMs)

  return stopContinuousCapture
}

/**
 * Stop continuous capture
 */
export function stopContinuousCapture(): void {
  if (continuousCaptureInterval) {
    clearInterval(continuousCaptureInterval)
    continuousCaptureInterval = null
  }
  continuousCaptureCallback = null
}

/**
 * List all available screen and window sources
 */
export async function listSources(): Promise<ScreenSource[]> {
  try {
    const [screenSources, windowSources] = await Promise.all([
      desktopCapturer.getSources({ types: ['screen'] }),
      desktopCapturer.getSources({ types: ['window'] })
    ])

    const sources: ScreenSource[] = [
      ...screenSources.map((s) => ({
        id: s.id,
        name: s.name,
        type: 'screen' as const
      })),
      ...windowSources.map((s) => ({
        id: s.id,
        name: s.name,
        type: 'window' as const
      }))
    ]

    return sources
  } catch (err) {
    console.warn('[screen] Failed to list sources:', err instanceof Error ? err.message : String(err))
    return []
  }
}
