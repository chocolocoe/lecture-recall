import { createContext, useContext } from 'react'

export const SettingsModalContext = createContext<(() => void) | null>(null)
export function useOpenSettings() {
  const openSettings = useContext(SettingsModalContext)
  if (!openSettings) throw new Error('useOpenSettings must be used inside Layout')
  return openSettings
}
