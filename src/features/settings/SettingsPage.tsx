import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Accessibility, Check, Info, KeyRound, Laptop, Moon, Palette, RotateCcw, Settings2, Shield, Sun, UserRound, X } from 'lucide-react'
import { useCurrentRole } from '@/app/RoleContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { defaultSettings, presets, useTheme } from './ThemeProvider'
import type { Palette as ThemePalette, ThemePreset, ThemeSettings } from './ThemeProvider'

type Section = 'Profile' | 'Appearance' | 'Preferences' | 'Accessibility' | 'About'
const sections: { name: Section; icon: typeof UserRound }[] = [
  { name: 'Profile', icon: UserRound }, { name: 'Appearance', icon: Palette }, { name: 'Preferences', icon: Settings2 }, { name: 'Accessibility', icon: Accessibility }, { name: 'About', icon: Info },
]
const colorFields: { key: keyof ThemePalette; label: string; group: string }[] = [
  { key: 'background', label: 'Main background', group: 'Surfaces' }, { key: 'secondary', label: 'Secondary background', group: 'Surfaces' }, { key: 'surface', label: 'Card surface', group: 'Surfaces' }, { key: 'elevated', label: 'Elevated surface', group: 'Surfaces' }, { key: 'input', label: 'Input background', group: 'Surfaces' },
  { key: 'text', label: 'Primary text', group: 'Text and borders' }, { key: 'muted', label: 'Secondary text', group: 'Text and borders' }, { key: 'border', label: 'Border', group: 'Text and borders' },
  { key: 'accent', label: 'Accent', group: 'Interactive and status' }, { key: 'accentHover', label: 'Accent hover', group: 'Interactive and status' }, { key: 'success', label: 'Success', group: 'Interactive and status' }, { key: 'warning', label: 'Warning', group: 'Interactive and status' }, { key: 'error', label: 'Error', group: 'Interactive and status' },
]
const quickColors = ['#22d3ee', '#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ec4899']
const validHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings, saveSettings, resetSettings } = useTheme()
  const { user, profile, membership, classroom, refreshIdentity } = useAuth()
  const role = useCurrentRole()
  const [section, setSection] = useState<Section>('Appearance')
  const [initial, setInitial] = useState(settings)
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [accentText, setAccentText] = useState(settings.accent)
  const [colorText, setColorText] = useState<Partial<Record<keyof ThemePalette, string>>>({})
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dirty = JSON.stringify(settings) !== JSON.stringify(initial)

  useEffect(() => {
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = oldOverflow
      document.querySelector<HTMLButtonElement>('[aria-label="Open profile menu"]')?.focus()
    }
  }, [])
  useEffect(() => { setAccentText(settings.accent) }, [settings.accent])
  useEffect(() => { setColorText({}) }, [settings.palette])
  useEffect(() => { setDisplayName(profile?.display_name ?? '') }, [profile?.display_name])

  function close(keep = false) {
    if (!keep) updateSettings(initial)
    onClose()
  }
  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !pending) { event.stopPropagation(); close() }
    if (event.key === 'Tab') {
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!nodes?.length) return
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }
  function apply() {
    saveSettings()
    setInitial(settings)
    setNotice('Appearance and preferences saved on this device.')
  }
  function resetAll() {
    resetSettings()
    setNotice('Defaults are previewed. Select Apply to save them.')
  }
  function setPreset(preset: ThemePreset) {
    const palette = presets[preset].palette
    const darkPresets: ThemePreset[] = ['midnight-black', 'deep-charcoal', 'graphite', 'amoled-black', 'slate', 'midnight-blue']
    updateSettings({ preset, mode: darkPresets.includes(preset) ? 'dark' : 'light', palette, accent: palette.accent })
  }
  function setColor(key: keyof ThemePalette, value: string) {
    if (!validHex(value)) return
    updateSettings({ palette: { [key]: value }, ...(key === 'accent' ? { accent: value } : {}) })
  }

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user) return
    setPending(true); setError(''); setNotice('')
    const { error: saveError } = await supabase.from('profiles').update({ display_name: displayName.trim() || null }).eq('id', user.id)
    setPending(false)
    if (saveError) { setError('Display name could not be saved. Please try again.'); return }
    setNotice('Display name saved.')
    await refreshIdentity()
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user?.email) return
    setError(''); setNotice('')
    if (newPassword.length < 12) return setError('Choose a password with at least 12 characters.')
    if (newPassword !== confirmPassword) return setError('The new passwords do not match.')
    setPending(true)
    const { data: check, error: checkError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
    if (checkError || check.user?.id !== user.id) { setPending(false); setError('Current password is incorrect.'); return }
    const { error: changeError } = await supabase.auth.updateUser({ password: newPassword })
    setPending(false)
    if (changeError) { setError('Password could not be updated. Please check the requirements and try again.'); return }
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setNotice('Password updated.')
  }

  return <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) close() }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={onDialogKeyDown} className="settings-dialog">
      <header className="settings-header"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--muted)]">Lecture Recall</p><h1 id="settings-title" className="mt-1 text-xl font-bold">Settings</h1></div><button ref={closeRef} type="button" onClick={() => close()} className="settings-icon-button" aria-label="Close settings"><X size={19} /></button></header>
      <div className="settings-body">
        <nav aria-label="Settings categories" className="settings-nav">{sections.map(({ name, icon: Icon }) => <button key={name} type="button" onClick={() => setSection(name)} aria-current={section === name ? 'page' : undefined} className={`settings-nav-item ${section === name ? 'is-active' : ''}`}><Icon size={17} /><span>{name}</span></button>)}</nav>
        <main className="settings-content">
          <div className="settings-content-heading"><div><h2>{section}</h2><p>{section === 'Appearance' ? 'Tune the colors and surfaces across your workspace.' : section === 'Profile' ? 'Manage your identity and account security.' : section === 'Preferences' ? 'Choose how the workspace behaves.' : section === 'Accessibility' ? 'Adjust the interface to suit your needs.' : 'Information about this application.'}</p></div></div>
          {error && <p role="alert" className="settings-message is-error">{error}</p>}{notice && <p role="status" className="settings-message is-success"><Check size={15} />{notice}</p>}
          {section === 'Profile' && <div className="settings-stack">
            <section className="settings-panel"><h3>Account information</h3><div className="settings-account-grid"><div><span>Username</span><strong>@{profile?.username ?? '—'}</strong></div><div><span>Role</span><strong className="capitalize">{membership?.role === 'admin' ? 'Administrator' : membership?.role ?? '—'}</strong></div><div><span>Classroom</span><strong>{classroom?.name ?? '—'}</strong></div></div><form onSubmit={saveDisplayName} className="settings-form"><Input id="settings-display-name" label="Display name" autoComplete="nickname" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save display name'}</Button></form><p className="mt-3 text-xs text-[var(--muted)]">Username and role are read-only here. Your classroom administrator manages account changes.</p></section>
            <section className="settings-panel"><h3 className="flex items-center gap-2"><KeyRound size={16} /> Change password</h3><form onSubmit={changePassword} className="settings-form"><Input id="current-password" label="Current password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /><Input id="new-password" label="New password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><Input id="confirm-password" label="Confirm new password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /><Button type="submit" disabled={pending}>{pending ? 'Updating…' : 'Update password'}</Button></form></section>
            {role === 'admin' && <p className="text-xs text-[var(--muted)]">Classroom administration is available from the Classroom workspace.</p>}
          </div>}
          {section === 'Appearance' && <div className="settings-stack">
            <section className="settings-panel"><h3>Theme mode</h3><div className="settings-choice-row">{[{ key: 'light', label: 'Light', Icon: Sun }, { key: 'dark', label: 'Dark', Icon: Moon }, { key: 'system', label: 'System', Icon: Laptop }].map(({ key, label, Icon }) => <button key={key} type="button" aria-pressed={settings.mode === key} onClick={() => updateSettings({ mode: key as ThemeSettings['mode'] })} className={`settings-mode ${settings.mode === key ? 'is-selected' : ''}`}><Icon size={17} />{label}</button>)}</div></section>
            <section className="settings-panel"><div className="flex items-center justify-between"><div><h3>Theme presets</h3><p className="settings-help">Choose a palette, then personalize it below.</p></div></div><div className="settings-presets">{(Object.entries(presets) as [ThemePreset, typeof presets[ThemePreset]][]).map(([key, item]) => <button key={key} type="button" onClick={() => setPreset(key)} aria-pressed={settings.preset === key} className={`settings-preset ${settings.preset === key ? 'is-selected' : ''}`}><span className="settings-swatches"><i style={{ background: item.palette.background }} /><i style={{ background: item.palette.surface }} /><i style={{ background: item.palette.accent }} /></span><span>{item.label}</span></button>)}</div></section>
            <section className="settings-panel"><h3>Accent color</h3><div className="settings-accent-row"><input aria-label="Choose accent color" type="color" value={settings.accent} onChange={(event) => { updateSettings({ accent: event.target.value, palette: { accent: event.target.value } }); setAccentText(event.target.value) }} /><input aria-label="Accent color hex value" aria-invalid={!validHex(accentText)} className="settings-hex" value={accentText} maxLength={7} onChange={(event) => { setAccentText(event.target.value); if (validHex(event.target.value)) updateSettings({ accent: event.target.value, palette: { accent: event.target.value } }) }} onBlur={() => { if (!validHex(accentText)) setAccentText(settings.accent) }} />{quickColors.map((color) => <button key={color} type="button" className="settings-color-dot" style={{ backgroundColor: color }} aria-label={`Use accent color ${color}`} onClick={() => { updateSettings({ accent: color, palette: { accent: color } }); setAccentText(color) }} />)}</div></section>
            <section className="settings-panel"><h3>Dark theme intensity</h3><p className="settings-help">Fine-tune the depth of dark surfaces and readability.</p><div className="settings-sliders">{([{ key: 'backgroundDarkness', label: 'Background darkness' }, { key: 'surfaceDarkness', label: 'Surface darkness' }, { key: 'borderContrast', label: 'Border contrast' }, { key: 'textContrast', label: 'Text contrast' }] as const).map(({ key, label }) => <label key={key} className="settings-range"><span>{label}<output>{settings[key]}%</output></span><input type="range" min="0" max="100" value={settings[key]} onChange={(event) => updateSettings({ [key]: Number(event.target.value) })} /></label>)}</div></section>
            <details className="settings-panel settings-advanced"><summary>Advanced palette customization</summary><p className="settings-help mt-2">These colors preview across the app. Pick a color or enter a six-digit hex value.</p>{['Surfaces', 'Text and borders', 'Interactive and status'].map((group) => <div key={group} className="settings-color-group"><div className="settings-color-group-heading"><h4>{group}</h4><button type="button" onClick={() => updateSettings({ palette: Object.fromEntries(colorFields.filter((field) => field.group === group).map((field) => [field.key, defaultSettings.palette[field.key]])) })}>Reset group</button></div><div className="settings-color-grid">{colorFields.filter((field) => field.group === group).map(({ key, label }) => <label key={key} className="settings-color-field"><span>{label}</span><span className="settings-color-input"><input type="color" aria-label={`${label} color picker`} value={settings.palette[key]} onChange={(event) => { setColorText((current) => ({ ...current, [key]: event.target.value })); setColor(key, event.target.value) }} /><input aria-label={`${label} hex value`} aria-invalid={Boolean(colorText[key] && !validHex(colorText[key] ?? ''))} value={colorText[key] ?? settings.palette[key]} maxLength={7} onChange={(event) => { setColorText((current) => ({ ...current, [key]: event.target.value })); setColor(key, event.target.value) }} onBlur={() => { if (colorText[key] && !validHex(colorText[key] ?? '')) setColorText((current) => ({ ...current, [key]: settings.palette[key] })) }} /></span></label>)}</div></div>)}</details>
            <section className="settings-preview"><h3>Live preview</h3><div className="settings-preview-card"><div><strong>Lesson notes</strong><p>See how your palette looks across common controls.</p></div><button type="button" className="settings-preview-button">Primary action</button><input aria-label="Preview text input" placeholder="Input preview" /></div></section>
          </div>}
          {section === 'Preferences' && <div className="settings-panel settings-options"><h3>Workspace behavior</h3><label className="settings-toggle"><span><strong>Interface density</strong><small>Choose spacing across lists and panels.</small></span><select value={settings.density} onChange={(event) => updateSettings({ density: event.target.value as ThemeSettings['density'] })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><p className="settings-help">Notification and sidebar behavior preferences are not available in this version.</p></div>}
          {section === 'Accessibility' && <div className="settings-panel settings-options"><h3>Reading and motion</h3><label className="settings-toggle"><span><strong>Reduced motion</strong><small>Limit nonessential transitions and animations.</small></span><input type="checkbox" checked={settings.reducedMotion} onChange={(event) => updateSettings({ reducedMotion: event.target.checked })} /></label><label className="settings-toggle"><span><strong>Higher contrast</strong><small>Increase text and border definition.</small></span><input type="checkbox" checked={settings.highContrast} onChange={(event) => updateSettings({ highContrast: event.target.checked })} /></label><label className="settings-toggle"><span><strong>Text size</strong><small>Set the base interface text size.</small></span><select value={settings.textSize} onChange={(event) => updateSettings({ textSize: event.target.value as ThemeSettings['textSize'] })}><option value="small">Small</option><option value="default">Default</option><option value="large">Large</option></select></label><p className="settings-help">Reduced motion also respects your operating-system preference.</p></div>}
          {section === 'About' && <div className="settings-panel"><div className="flex items-start gap-3"><span className="settings-about-icon"><Shield size={20} /></span><div><h3>Lecture Recall</h3><p className="settings-help mt-1">A classroom learning workspace for lessons, notes, assignments, and catching up.</p></div></div><dl className="settings-about-list"><div><dt>Version</dt><dd>0.1.0</dd></div><div><dt>Account</dt><dd>{profile?.username ? `@${profile.username}` : 'Signed-in member'}</dd></div><div><dt>Classroom</dt><dd>{classroom?.name ?? '—'}</dd></div></dl><div className="mt-4 flex flex-wrap gap-2"><a href="https://github.com/chocolocoe/lecture-recall" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#183b58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2">GitHub Repository</a><a href="https://chocolocoe.netlify.app/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2">About Developer</a><a href="https://lecture-recall.netlify.app/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2">Visit Website</a></div></div>}
        </main>
      </div>
      <footer className="settings-footer"><div className="settings-unsaved">{dirty ? 'Unsaved changes' : 'All changes saved'}</div><div className="flex items-center gap-2"><Button variant="ghost" onClick={resetAll}><RotateCcw size={15} />Reset defaults</Button><Button variant="outline" onClick={() => close()} disabled={pending}>Cancel</Button><Button onClick={apply} disabled={!dirty || pending}>Apply</Button></div></footer>
    </section>
  </div>
}
