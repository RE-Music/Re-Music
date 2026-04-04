import { useEffect } from 'react';
import { useEqStore, EQ_BANDS } from '../store/useEqStore';

let audioCtx: AudioContext | null = null;
let filterNodes: BiquadFilterNode[] = [];
let connected = false;

function getAudio(): HTMLAudioElement | null {
  return document.querySelector('audio');
}

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
  const audio = getAudio();
  if (!audio) return;

  if (!connected) {
    try {
      audioCtx = new AudioContext();

      // Auto-resume whenever context gets suspended (e.g. tab focus changes)
      audioCtx.onstatechange = () => {
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      };

      const sourceNode = audioCtx.createMediaElementSource(audio);

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

      sourceNode.connect(filterNodes[0]);
      for (let i = 0; i < filterNodes.length - 1; i++) {
        filterNodes[i].connect(filterNodes[i + 1]);
      }
      filterNodes[filterNodes.length - 1].connect(gainNode);
      gainNode.connect(audioCtx.destination);

      connected = true;
      console.log('[AudioEngine] 10-band EQ initialized');
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

  useEffect(() => {
    if (!connected) return;
    filterNodes.forEach((f, i) => {
      f.gain.value = isEnabled ? gains[i] : 0;
    });
  }, [gains, isEnabled]);
}
