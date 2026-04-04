import { create } from 'zustand';
import type { Track } from '../../shared/interfaces/IMusicProvider';

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  progressMs: number;
  durationMs: number;
  isShuffle: boolean;
  repeatMode: 'none' | 'one' | 'all';
  isMuted: boolean;
  queue: Track[];
  
  // Spotify Integration
  spotifyPlayer: any | null;
  spotifyDeviceId: string | null;
  setSpotifyPlayer: (player: any) => void;
  setSpotifyDeviceId: (id: string) => void;
  
  // Actions
  playTrack: (track: Track) => void;
  togglePlayPause: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleMute: () => void;
  setVolume: (volume: number) => void;
  setProgress: (ms: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setQueue: (queue: Track[]) => void;
  addToQueue: (tracks: Track[]) => void;
  setCurrentTrack: (track: Track | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
}

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  volume: 1, // 0.0 to 1.0
  progressMs: 0,
  durationMs: 0,
  isShuffle: false,
  repeatMode: 'none',
  isMuted: false,
  queue: [],

  // Spotify integration
  spotifyPlayer: null,
  spotifyDeviceId: null,
  setSpotifyPlayer: (player) => set({ spotifyPlayer: player }),
  setSpotifyDeviceId: (id) => set({ spotifyDeviceId: id }),

  playTrack: (track) => 
    set({ currentTrack: track, isPlaying: true, progressMs: 0, durationMs: track.durationMs }),
    
  togglePlayPause: () => 
    set((state) => {
      const isPlaying = !state.isPlaying && state.currentTrack !== null;
      if (state.currentTrack?.provider === 'spotify' && state.spotifyPlayer) {
        state.spotifyPlayer.togglePlay();
      }
      return { isPlaying };
    }),

  toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),

  toggleRepeat: () => set((state) => {
    const modes: ('none' | 'one' | 'all')[] = ['none', 'all', 'one'];
    const currentIndex = modes.indexOf(state.repeatMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    return { repeatMode: nextMode };
  }),

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  setVolume: (volume) => {
    const v = Math.max(0, Math.min(1, volume));
    set({ volume: v });
    const { currentTrack, spotifyPlayer } = get();
    if (currentTrack?.provider === 'spotify' && spotifyPlayer) {
      spotifyPlayer.setVolume(v);
    }
    window.electronAPI.invoke('update-setting', { key: 'volume', value: v });
  },

  setProgress: (ms) => 
    set({ progressMs: ms }),

  nextTrack: async () => {
    const { queue, currentTrack, isShuffle, repeatMode } = get();
    if (!currentTrack || queue.length === 0) return;
    
    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
    let nextIndex = -1;

    if (repeatMode === 'one') {
      nextIndex = currentIndex;
    } else if (isShuffle) {
      // Pick random different from current if possible
      if (queue.length > 1) {
        do {
          nextIndex = Math.floor(Math.random() * queue.length);
        } while (nextIndex === currentIndex);
      } else {
        nextIndex = 0;
      }
    } else {
      if (currentIndex !== -1 && currentIndex < queue.length - 1) {
        nextIndex = currentIndex + 1;
      } else if (repeatMode === 'all') {
        nextIndex = 0;
      }
    }
    
    if (nextIndex !== -1) {
      const next = queue[nextIndex];
      // For Spotify, we use the custom IPC that hits the Web SDK
      if (next.provider === 'spotify') {
        const { spotifyDeviceId } = get();
        if (spotifyDeviceId) {
          await window.electronAPI.invoke('play-spotify-uri', {
            deviceId: spotifyDeviceId,
            trackId: next.id
          });
          set({ currentTrack: next, isPlaying: true, progressMs: 0, durationMs: next.durationMs });
        }
      } else {
        const streamUrl = await window.electronAPI.invoke('play-track', { 
          providerId: next.provider, 
          trackId: next.id 
        });
        set({ currentTrack: { ...next, streamUrl }, isPlaying: true, progressMs: 0, durationMs: next.durationMs });
      }
    }
  },

  prevTrack: async () => {
    const { queue, currentTrack } = get();
    if (!currentTrack || queue.length === 0) return;
    
    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
    if (currentIndex > 0) {
      const prev = queue[currentIndex - 1];
      if (prev.provider === 'spotify') {
        const { spotifyDeviceId } = get();
        if (spotifyDeviceId) {
          await window.electronAPI.invoke('play-spotify-uri', {
            deviceId: spotifyDeviceId,
            trackId: prev.id
          });
          set({ currentTrack: prev, isPlaying: true, progressMs: 0, durationMs: prev.durationMs });
        }
      } else {
        const streamUrl = await window.electronAPI.invoke('play-track', { 
          providerId: prev.provider, 
          trackId: prev.id 
        });
        set({ currentTrack: { ...prev, streamUrl }, isPlaying: true, progressMs: 0, durationMs: prev.durationMs });
      }
    }
  },

  setQueue: (queue) => set({ queue }),
  addToQueue: (tracks: Track[]) => set((state: any) => ({ queue: [...state.queue, ...tracks] })),
  setCurrentTrack: (track) => set({ currentTrack: track, progressMs: 0, durationMs: track?.durationMs || 0 }),
  setIsPlaying: (isPlaying) => set({ isPlaying })
}));
