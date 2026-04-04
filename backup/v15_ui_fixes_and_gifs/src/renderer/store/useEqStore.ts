import { create } from 'zustand';

export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export interface EqPreset {
  name: string;
  gains: number[]; // one per band, dB
  readonly?: boolean;
}

export const BUILT_IN_PRESETS: EqPreset[] = [
  { name: 'Flat',       gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],              readonly: true },
  { name: 'Bass Boost', gains: [8, 7, 5, 2, 0, 0, 0, 0, 0, 0],              readonly: true },
  { name: 'Vocal',      gains: [-2, -2, 0, 3, 5, 5, 3, 1, 0, 0],            readonly: true },
  { name: 'Electronic', gains: [5, 4, 1, 0, -3, 0, 1, 3, 5, 4],             readonly: true },
  { name: 'Rock',       gains: [4, 3, -1, -2, 0, 1, 3, 4, 4, 3],            readonly: true },
  { name: 'Classical',  gains: [4, 3, 2, 1, 0, 0, -1, -2, -3, -4],          readonly: true },
  { name: 'Podcast',    gains: [-2, -1, 0, 2, 5, 4, 2, 1, 0, 0],            readonly: true },
];

interface EqState {
  gains: number[];
  customPresets: EqPreset[];
  activePreset: string;
  isEnabled: boolean;
  isHydrated: boolean;

  init: () => Promise<void>;
  setBand: (index: number, gain: number) => void;
  applyPreset: (preset: EqPreset) => void;
  saveCustomPreset: (name: string) => void;
  deleteCustomPreset: (name: string) => void;
  toggleEq: () => void;
  resetBands: () => void;

  allPresets: () => EqPreset[];
}

export const useEqStore = create<EqState>((set, get) => ({
  gains: new Array(EQ_BANDS.length).fill(0),
  customPresets: [],
  activePreset: 'Flat',
  isEnabled: false,
  isHydrated: false,

  allPresets: () => [...BUILT_IN_PRESETS, ...get().customPresets],

  init: async () => {
    try {
      const state = await window.electronAPI.invoke('get-eq-state');
      if (state) {
        set({
          gains: state.gains || new Array(EQ_BANDS.length).fill(0),
          customPresets: state.presets || [],
          activePreset: state.activePreset || 'Flat',
          isEnabled: state.isEnabled || false,
          isHydrated: true
        });
      }
    } catch (e) {
      console.error('[EqStore] Failed to hydrate:', e);
    }
  },

  setBand: (index, gain) => {
    set(state => {
      const gains = [...state.gains];
      gains[index] = Math.max(-12, Math.min(12, gain));
      const next = { ...state, gains, activePreset: 'Custom' };
      window.electronAPI.invoke('save-eq-state', { gains: next.gains, presets: next.customPresets, activePreset: next.activePreset, isEnabled: next.isEnabled });
      return next;
    });
  },

  applyPreset: (preset) => {
    set(state => {
      const next = { ...state, gains: [...preset.gains], activePreset: preset.name };
      window.electronAPI.invoke('save-eq-state', { gains: next.gains, presets: next.customPresets, activePreset: next.activePreset, isEnabled: next.isEnabled });
      return next;
    });
  },

  saveCustomPreset: (name) => {
    set(state => {
      const existing = state.customPresets.filter(p => p.name !== name);
      const newPreset: EqPreset = { name, gains: [...state.gains] };
      const customPresets = [...existing, newPreset];
      const next = { ...state, customPresets, activePreset: name };
      window.electronAPI.invoke('save-eq-state', { gains: next.gains, presets: next.customPresets, activePreset: next.activePreset, isEnabled: next.isEnabled });
      return next;
    });
  },

  deleteCustomPreset: (name) => {
    set(state => {
      const customPresets = state.customPresets.filter(p => p.name !== name);
      const next = { ...state, customPresets };
      window.electronAPI.invoke('save-eq-state', { gains: next.gains, presets: next.customPresets, activePreset: next.activePreset, isEnabled: next.isEnabled });
      return next;
    });
  },

  toggleEq: () => {
    set(state => {
      const next = { ...state, isEnabled: !state.isEnabled };
      window.electronAPI.invoke('save-eq-state', { gains: next.gains, presets: next.customPresets, activePreset: next.activePreset, isEnabled: next.isEnabled });
      return next;
    });
  },

  resetBands: () => {
    const gains = new Array(EQ_BANDS.length).fill(0);
    set(state => {
      const next = { ...state, gains, activePreset: 'Flat' };
      window.electronAPI.invoke('save-eq-state', { gains: next.gains, presets: next.customPresets, activePreset: next.activePreset, isEnabled: next.isEnabled });
      return next;
    });
  },
}));
