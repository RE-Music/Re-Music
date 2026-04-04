import { useEffect } from 'react';
import { useEqStore, EQ_BANDS } from '../store/useEqStore';
import { usePlayerStore } from '../store/usePlayerStore';

let audioCtx: AudioContext | null = null;
let filterNodes: BiquadFilterNode[] = [];
let connected = false;


/**
 * Returns a promise that resolves only AFTER AudioContext is running.
 * Must be awaited before audio.play() when EQ is active.
 */
export async function ensureCtxRunning(): Promise<void> {
  if (!audioCtx || audioCtx.state === 'running') return;
  await audioCtx.resume();
}

/**
 * Called SYNCHRONOUSLY from a click handler (user gesture).
 */
export function initAndResumeEq() {
  const audios = document.querySelectorAll('audio');

  if (!connected && audios.length > 0) {
    try {
      audioCtx = new AudioContext();
      
      filterNodes = EQ_BANDS.map((freq, i) => {
        const f = audioCtx!.createBiquadFilter();
        f.type = 'peaking';
        f.frequency.value = freq;
        f.Q.value = 1.2;
        f.gain.value = useEqStore.getState().gains[i];
        return f;
      });

      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 1;

      // Connect filters in chain
      for (let i = 0; i < filterNodes.length - 1; i++) {
        filterNodes[i].connect(filterNodes[i + 1]);
      }
      filterNodes[filterNodes.length - 1].connect(gainNode);
      gainNode.connect(audioCtx.destination);

      // Connect ALL found audio elements to the start of the chain
      audios.forEach(audio => {
        try {
          const sourceNode = audioCtx!.createMediaElementSource(audio);
          sourceNode.connect(filterNodes[0]);
        } catch (err) {
          console.warn('[AudioEngine] Could not connect audio element:', err);
        }
      });

      connected = true;
      console.log(`[AudioEngine] 10-band EQ initialized for ${audios.length} elements`);
    } catch (e) {
      console.error('[AudioEngine] Failed to init:', e);
      return;
    }
  }

  // Resume immediately (we're in a user-gesture call stack)
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

/** Returns true if Web Audio has been initialized. */
export function isEqConnected(): boolean {
  return connected;
}

/**
 * Hook — mount once. Keeps EQ filter gains in sync.
 */
export function useAudioEngine() {
  const { gains, isEnabled } = useEqStore();
  const currentTrackId = usePlayerStore(state => state.currentTrack?.id);

  useEffect(() => {
    if (!connected) return;
    filterNodes.forEach((f, i) => {
      f.gain.value = isEnabled ? gains[i] : 0;
    });
  }, [gains, isEnabled, currentTrackId]);
}
