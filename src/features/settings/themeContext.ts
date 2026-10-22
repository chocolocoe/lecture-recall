import { createContext, useContext } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
type ThemeContextValue = { preference: ThemePreference; setPreference: (theme: ThemePreference) => void }
export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
