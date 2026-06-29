import { createContext, useContext, useState, type ReactNode } from 'react'

export type Level = 'beginner' | 'pro'

type SettingsValue = {
  /** Default register for finding explanations. Pages may still toggle locally. */
  defaultLevel: Level
  setDefaultLevel: (level: Level) => void
  /**
   * Opt-in auto-merge for low-risk dependency bumps only (principle #5).
   * Everything else always opens a PR for human review (principle #1).
   */
  autoMergeDependencies: boolean
  setAutoMergeDependencies: (on: boolean) => void
}

const SettingsContext = createContext<SettingsValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [defaultLevel, setDefaultLevel] = useState<Level>('beginner')
  const [autoMergeDependencies, setAutoMergeDependencies] = useState(false)

  return (
    <SettingsContext.Provider
      value={{ defaultLevel, setDefaultLevel, autoMergeDependencies, setAutoMergeDependencies }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}
