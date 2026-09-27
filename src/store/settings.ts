import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DIFFICULTY, type Difficulty } from '../game/constants'

export interface SettingsState {
  difficulty: Difficulty
  masterVol: number
  sfxVol: number
  crowdVol: number
  muted: boolean
  umpVoice: boolean
  /** Umpire eye height (ft). */
  camHeight: number
  /** Distance behind the front edge of the plate (ft). */
  camBack: number
  camFov: number
  /** Lateral offset into the "slot" over the catcher's shoulder (ft). */
  slotOffset: number
  /** 'auto' = difficulty preset; number = explicit multiplier on real speed. */
  pitchSpeed: 'auto' | number
  callWindow: 'auto' | number
  zoneVisibility: 'auto' | 'always' | 'never'
  hesitationPolicy: 'miss' | 'penalty'
  colorblind: boolean
  nightGame: boolean
  /** Subtle camera kick on the mitt pop and bat crack. */
  cameraShake: boolean
  /** First-game coaching tips. */
  showTips: boolean
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      difficulty: 'pro',
      masterVol: 0.9,
      sfxVol: 0.9,
      crowdVol: 0.7,
      muted: false,
      umpVoice: true,
      camHeight: 3.65,
      camBack: 6.0,
      camFov: 55,
      slotOffset: 0.8,
      pitchSpeed: 'auto',
      callWindow: 'auto',
      zoneVisibility: 'auto',
      hesitationPolicy: 'miss',
      colorblind: false,
      nightGame: true,
      cameraShake: true,
      showTips: true,
      set: (patch) => set(patch),
    }),
    {
      name: 'judgment-call-settings-v1',
      version: 2,
      // v2: graphics are always full quality; drop the old per-device setting.
      migrate: (persisted) => {
        const state = { ...((persisted ?? {}) as Record<string, unknown>) }
        delete state.quality
        return state as unknown as SettingsState
      },
    },
  ),
)

export function effectiveTimeScale(s: SettingsState): number {
  return s.pitchSpeed === 'auto' ? DIFFICULTY[s.difficulty].timeScale : s.pitchSpeed
}

export function effectiveCallWindowMs(s: SettingsState): number {
  return s.callWindow === 'auto' ? DIFFICULTY[s.difficulty].callWindowMs : s.callWindow
}

export function zoneGhostVisible(s: SettingsState): boolean {
  if (s.zoneVisibility === 'always') return true
  if (s.zoneVisibility === 'never') return false
  return DIFFICULTY[s.difficulty].zoneVisibleDuringPitch
}
