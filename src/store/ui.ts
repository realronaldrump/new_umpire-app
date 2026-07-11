import { create } from 'zustand'

interface UiState {
  settingsOpen: boolean
  set: (patch: Partial<Omit<UiState, 'set'>>) => void
}

export const useUi = create<UiState>()((set) => ({
  settingsOpen: false,
  set: (patch) => set(patch),
}))
