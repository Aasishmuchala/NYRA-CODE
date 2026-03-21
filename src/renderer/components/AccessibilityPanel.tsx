/**
 * Accessibility Panel — Configure accessibility settings
 */
import React, { useState, useEffect } from 'react'
import { Accessibility, RotateCcw } from 'lucide-react'

interface A11ySettings {
  highContrast: boolean; reducedMotion: boolean; fontScale: number
  screenReaderMode: boolean; focusIndicators: boolean
  colorBlindMode: string; largeClickTargets: boolean
  keyboardNavigation: boolean; announceNotifications: boolean
}

const Toggle: React.FC<{ on: boolean; onChange: () => void }> = ({ on, onChange }) => (
  <button onClick={onChange} className={`w-8 h-4 rounded-full transition-colors ${on ? 'bg-terra-400/50' : 'bg-white/10'}`}>
    <div className={`w-3.5 h-3.5 rounded-full bg-white/80 transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
)

const AccessibilityPanel: React.FC = () => {
  const [settings, setSettings] = useState<A11ySettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = async () => { try { const r = await window.nyra.accessibility.getSettings(); if (r.success) setSettings(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) } }
  useEffect(() => { fetch_() }, [])

  const update = async (key: string, value: any) => {
    try { const r = await window.nyra.accessibility.update({ [key]: value }); if (r.success) setSettings(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }

  const reset = async () => { try { const r = await window.nyra.accessibility.reset(); if (r.success) setSettings(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) } }

  if (!settings) return null

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Accessibility size={16} className="text-sage-300" />
        <h2 className="text-sm font-semibold text-white/80">Accessibility</h2>
        <button onClick={reset} className="ml-auto text-[10px] text-white/20 hover:text-white/40 flex items-center gap-1"><RotateCcw size={10} /> Reset</button>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blush-400/10 border border-blush-400/20 flex items-center justify-between">
          <p className="text-[10px] text-blush-300/70">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] text-blush-300/40 hover:text-blush-300/70 ml-2">dismiss</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div className="space-y-3">
          <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Visual</h3>
          <label className="flex items-center justify-between"><span className="text-[12px] text-white/50">High contrast</span><Toggle on={settings.highContrast} onChange={() => update('highContrast', !settings.highContrast)} /></label>
          <label className="flex items-center justify-between"><span className="text-[12px] text-white/50">Reduced motion</span><Toggle on={settings.reducedMotion} onChange={() => update('reducedMotion', !settings.reducedMotion)} /></label>
          <label className="flex items-center justify-between"><span className="text-[12px] text-white/50">Focus indicators</span><Toggle on={settings.focusIndicators} onChange={() => update('focusIndicators', !settings.focusIndicators)} /></label>
          <label className="flex items-center justify-between">
            <span className="text-[12px] text-white/50">Font scale ({settings.fontScale.toFixed(1)}x)</span>
            <input type="range" min="0.8" max="2" step="0.1" value={settings.fontScale} onChange={e => update('fontScale', parseFloat(e.target.value))} className="w-28 accent-terra-400" />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-[12px] text-white/50">Color blind mode</span>
            <select value={settings.colorBlindMode} onChange={e => update('colorBlindMode', e.target.value)}
              className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1 text-[11px] text-white/50 outline-none">
              <option value="none">None</option>
              <option value="protanopia">Protanopia</option>
              <option value="deuteranopia">Deuteranopia</option>
              <option value="tritanopia">Tritanopia</option>
            </select>
          </label>
        </div>

        <div className="space-y-3 pt-2 border-t border-white/[0.04]">
          <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Interaction</h3>
          <label className="flex items-center justify-between"><span className="text-[12px] text-white/50">Large click targets (44px)</span><Toggle on={settings.largeClickTargets} onChange={() => update('largeClickTargets', !settings.largeClickTargets)} /></label>
          <label className="flex items-center justify-between"><span className="text-[12px] text-white/50">Keyboard navigation</span><Toggle on={settings.keyboardNavigation} onChange={() => update('keyboardNavigation', !settings.keyboardNavigation)} /></label>
        </div>

        <div className="space-y-3 pt-2 border-t border-white/[0.04]">
          <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Screen Reader</h3>
          <label className="flex items-center justify-between"><span className="text-[12px] text-white/50">Screen reader mode</span><Toggle on={settings.screenReaderMode} onChange={() => update('screenReaderMode', !settings.screenReaderMode)} /></label>
          <label className="flex items-center justify-between"><span className="text-[12px] text-white/50">Announce notifications</span><Toggle on={settings.announceNotifications} onChange={() => update('announceNotifications', !settings.announceNotifications)} /></label>
        </div>
      </div>
    </div>
  )
}
export default AccessibilityPanel
