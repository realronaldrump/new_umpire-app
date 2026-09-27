import { create } from 'zustand'

interface UiState {
  settingsOpen: boolean
  /** The 3D park has rendered its first frames (hides the loader). */
  sceneReady: boolean
  howToOpen: boolean
  set: (patch: Partial<Omit<UiState, 'set'>>) => void
}

export const useUi = create<UiState>()((set) => ({
  settingsOpen: false,
  sceneReady: false,
  howToOpen: false,
  set: (patch) => set(patch),
}))
