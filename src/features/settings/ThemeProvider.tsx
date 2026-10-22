/* eslint react-refresh/only-export-components: off */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ThemePreset = 'default-light' | 'midnight-black' | 'deep-charcoal' | 'graphite' | 'amoled-black' | 'slate' | 'midnight-blue' | 'cyan' | 'violet' | 'emerald'
export type Palette = { background: string; secondary: string; surface: string; elevated: string; input: string; text: string; muted: string; border: string; accent: string; accentHover: string; success: string; warning: string; error: string }
export type ThemeSettings = { mode: ThemePreference; preset: ThemePreset; accent: string; backgroundDarkness: number; surfaceDarkness: number; borderContrast: number; textContrast: number; palette: Palette; reducedMotion: boolean; density: 'comfortable' | 'compact'; textSize: 'small' | 'default' | 'large'; highContrast: boolean }
const basePalette: Palette = { background: '#f5f7fa', secondary: '#eef2f6', surface: '#ffffff', elevated: '#ffffff', input: '#ffffff', text: '#1e293b', muted: '#64748b', border: '#e2e8f0', accent: '#0e7490', accentHover: '#155e75', success: '#15803d', warning: '#b45309', error: '#be123c' }
export const presets: Record<ThemePreset, { label: string; palette: Palette }> = {
  'default-light': { label: 'Default Light', palette: basePalette },
  'midnight-black': { label: 'Midnight Black', palette: { background: '#05070a', secondary: '#0b0e13', surface: '#11151c', elevated: '#171d26', input: '#0b0e13', text: '#f1f5f9', muted: '#a1adbd', border: '#293240', accent: '#22d3ee', accentHover: '#06b6d4', success: '#4ade80', warning: '#fbbf24', error: '#fb7185' } },
  'deep-charcoal': { label: 'Deep Charcoal', palette: { background: '#111315', secondary: '#181b1f', surface: '#202429', elevated: '#292e34', input: '#181b1f', text: '#f1f3f5', muted: '#a0a8b2', border: '#39414a', accent: '#38bdf8', accentHover: '#0ea5e9', success: '#4ade80', warning: '#fbbf24', error: '#fb7185' } },
  graphite: { label: 'Graphite', palette: { background: '#17191c', secondary: '#202328', surface: '#282c31', elevated: '#33383f', input: '#202328', text: '#f3f4f6', muted: '#a6adb7', border: '#454b54', accent: '#a3e635', accentHover: '#84cc16', success: '#4ade80', warning: '#fbbf24', error: '#fb7185' } },
  'amoled-black': { label: 'AMOLED Black', palette: { background: '#000000', secondary: '#050505', surface: '#0b0b0b', elevated: '#141414', input: '#050505', text: '#f5f5f5', muted: '#a3a3a3', border: '#303030', accent: '#22d3ee', accentHover: '#06b6d4', success: '#4ade80', warning: '#fbbf24', error: '#fb7185' } },
  slate: { label: 'Slate', palette: { background: '#101923', secondary: '#172331', surface: '#1d2b3a', elevated: '#263749', input: '#172331', text: '#eff6ff', muted: '#a4b3c5', border: '#35485e', accent: '#7dd3fc', accentHover: '#38bdf8', success: '#4ade80', warning: '#fbbf24', error: '#fb7185' } },
  'midnight-blue': { label: 'Midnight Blue', palette: { background: '#07111f', secondary: '#0c1a2c', surface: '#12243a', elevated: '#1a304a', input: '#0c1a2c', text: '#eef6ff', muted: '#9bb0c8', border: '#29415c', accent: '#60a5fa', accentHover: '#3b82f6', success: '#4ade80', warning: '#fbbf24', error: '#fb7185' } },
  cyan: { label: 'Cyan', palette: { ...basePalette, accent: '#0891b2', accentHover: '#0e7490' } },
  violet: { label: 'Violet', palette: { ...basePalette, accent: '#7c3aed', accentHover: '#6d28d9' } },
  emerald: { label: 'Emerald', palette: { ...basePalette, accent: '#059669', accentHover: '#047857' } },
}
export const defaultSettings: ThemeSettings = { mode: 'system', preset: 'default-light', accent: basePalette.accent, backgroundDarkness: 80, surfaceDarkness: 68, borderContrast: 58, textContrast: 78, palette: basePalette, reducedMotion: false, density: 'comfortable', textSize: 'default', highContrast: false }
export type ThemePatch = Omit<Partial<ThemeSettings>, 'palette'> & { palette?: Partial<Palette> }
type ThemeContextValue = { settings: ThemeSettings; updateSettings: (patch: ThemePatch) => void; saveSettings: () => void; resetSettings: () => void; preference: ThemePreference; setPreference: (mode: ThemePreference) => void }
const ThemeContext = createContext<ThemeContextValue | null>(null)
const validHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v)
const clampHex = (value: string, fallback: string) => validHex(value) ? value : fallback
function storageKey(username: string | null) { return `lecture-recall-theme:${username ? username.toLocaleLowerCase() : 'guest'}` }

function applySettings(settings: ThemeSettings) {
  const root = document.documentElement
  const dark = settings.mode === 'dark' || (settings.mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const lightPresets: ThemePreset[] = ['default-light', 'cyan', 'violet', 'emerald']
  const source = dark && lightPresets.includes(settings.preset) ? { ...presets['deep-charcoal'].palette, accent: settings.palette.accent } : settings.palette
  const palette: Palette = { ...source, accent: clampHex(settings.accent, source.accent) }
  const rgb = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
  const hex = (values: number[]) => `#${values.map((value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('')}`
  const mix = (a: string, b: string, amount: number) => hex(rgb(a).map((value, index) => value * (1 - amount) + rgb(b)[index] * amount))
  if (dark) {
    palette.background = mix(palette.background, '#000000', (settings.backgroundDarkness / 100) * .8)
    palette.secondary = mix(palette.secondary, '#000000', (settings.backgroundDarkness / 100) * .58)
    palette.surface = mix(palette.surface, '#000000', (settings.surfaceDarkness / 100) * .68)
    palette.elevated = mix(palette.elevated, '#000000', (settings.surfaceDarkness / 100) * .48)
    palette.input = mix(palette.input, '#000000', (settings.surfaceDarkness / 100) * .58)
    palette.muted = mix(palette.muted, palette.text, Math.max(0, (settings.textContrast - 55) / 90))
  }
  root.classList.toggle('dark', dark)
  root.dataset.themeMode = dark ? 'dark' : 'light'
  root.dataset.preset = settings.preset
  root.dataset.density = settings.density
  root.dataset.textSize = settings.textSize
  root.dataset.reducedMotion = String(settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  root.dataset.highContrast = String(settings.highContrast)
  root.style.colorScheme = dark ? 'dark' : 'light'
  Object.entries(palette).forEach(([key, value]) => root.style.setProperty(`--${key}`, value))
  root.style.setProperty('--surface-base', palette.background)
  root.style.setProperty('--surface-card', palette.surface)
  root.style.setProperty('--surface-elevated', palette.elevated)
  root.style.setProperty('--surface-input', palette.input)
  root.style.setProperty('--text-primary', palette.text)
  root.style.setProperty('--text-secondary', palette.muted)
  root.style.setProperty('--border-subtle', dark ? mix(palette.background, palette.border, .58) : palette.border)
  root.style.setProperty('--border-default', palette.border)
  root.style.setProperty('--border-strong', dark ? mix(palette.border, palette.text, .2) : palette.border)
  root.style.setProperty('--border-alpha', String(Math.max(.25, settings.borderContrast / 100)))
  root.style.setProperty('--text-contrast', String(Math.max(.55, settings.textContrast / 100)))
  root.style.setProperty('--background-darkness', `${settings.backgroundDarkness}%`)
  root.style.setProperty('--surface-darkness', `${settings.surfaceDarkness}%`)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading, identityLoading } = useAuth()
  const [settings, setSettings] = useState<ThemeSettings>(defaultSettings)
  const [hydratedFor, setHydratedFor] = useState<string | null>(null)
  const preferenceOwner = profile?.username ?? null
  useLayoutEffect(() => {
    if (loading || identityLoading || (user && !preferenceOwner)) return
    let stored: Partial<ThemeSettings> = {}
    try { stored = JSON.parse(localStorage.getItem(storageKey(user ? preferenceOwner : null)) ?? '{}') as Partial<ThemeSettings> } catch { /* ignore stale or malformed preferences */ }
    const merged = { ...defaultSettings, ...stored, palette: { ...defaultSettings.palette, ...(stored.palette ?? {}) } }
    applySettings(merged)
    setSettings(merged)
    setHydratedFor(preferenceOwner)
  }, [user, preferenceOwner, loading, identityLoading])
  useLayoutEffect(() => {
    if (hydratedFor !== preferenceOwner) return
    applySettings(settings)
  }, [settings, hydratedFor, preferenceOwner])
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => applySettings(settings)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [settings])
  const updateSettings = useCallback((patch: ThemePatch) => setSettings((current) => ({ ...current, ...patch, palette: patch.palette ? { ...current.palette, ...patch.palette } : current.palette })), [])
  const saveSettings = useCallback(() => { try { localStorage.setItem(storageKey(user ? preferenceOwner : null), JSON.stringify(settings)) } catch { /* storage can be unavailable */ } }, [settings, user, preferenceOwner])
  const resetSettings = useCallback(() => setSettings(defaultSettings), [])
  const value = useMemo(() => ({ settings, updateSettings, saveSettings, resetSettings, preference: settings.mode, setPreference: (mode: ThemePreference) => updateSettings({ mode }) }), [settings, updateSettings, saveSettings, resetSettings])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
