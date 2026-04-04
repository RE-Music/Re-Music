import { create } from 'zustand';
console.log('!!! LOGS V2.6 LOADED !!!');
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
  lyrics: any | null;
  isLyricsOpen: boolean;
  
  // Spotify Integration
  spotifyPlayer: any | null;
  spotifyDeviceId: string | null;
  setSpotifyPlayer: (player: any) => void;
  setSpotifyDeviceId: (id: string | null) => void;
  
  // Actions
  playTrack: (track: Track) => Promise<boolean>;
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
  isLoadingTrack: boolean;
  setIsLoadingTrack: (isLoading: boolean) => void;
  lastRequestId: string | null;
  setLastRequestId: (id: string | null) => void;
  hardStopAll: () => Promise<void>;
  fetchLyrics: (track: Track) => Promise<void>;
  setLyricsOpen: (open: boolean) => void;
  setDurationMs: (ms: number) => void;
  syncState: (data: any) => void;
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
  lyrics: null,
  isLyricsOpen: false,

  // Spotify integration
  spotifyPlayer: null,
  spotifyDeviceId: null,
  setSpotifyPlayer: (player) => set({ spotifyPlayer: player }),
  setSpotifyDeviceId: (id) => set({ spotifyDeviceId: id }),

  playTrack: async (track) => {
    const state = get();
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[Store] playTrack started for ${track.title} (${track.id}). RequestId: ${requestId}`);
    set({ isLoadingTrack: true, lastRequestId: requestId });
    
    // Мгновенная жесткая остановка всего
    await state.hardStopAll();

    let success = true;
    let streamUrl = track.streamUrl;

    if (track.provider === 'spotify') {
      const deviceId = state.spotifyDeviceId;
      success = await window.electronAPI.invoke('play-spotify-uri', {
        deviceId: deviceId || undefined,
        trackId: track.id
      });
      
      if (state.spotifyPlayer) {
        state.spotifyPlayer.setVolume(state.volume * state.volume).catch(() => {});
      }
    } else {
      // Для всех остальных провайдеров получаем URL потока, если его нет
      if (!streamUrl) {
        try {
          streamUrl = await window.electronAPI.invoke('play-track', { 
            providerId: track.provider, 
            trackId: track.id 
          });
          if (!streamUrl) success = false;
        } catch (e) {
          console.error('[Store] playTrack fetch error:', e);
          success = false;
        }
      }
    }

    // ПРОВЕРКА: Не пришел ли другой запрос, пока мы ждали URL?
    if (get().lastRequestId !== requestId) {
      console.log(`[Store] playTrack: late request ${requestId} cancelled`);
      return false;
    }

    set({ 
      currentTrack: success ? { ...track, streamUrl } : state.currentTrack, 
      isPlaying: success, 
      progressMs: 0, 
      durationMs: track.durationMs, 
      isLoadingTrack: false 
    });
    
    if (success) {
      window.electronAPI.invoke('update-discord-presence', { 
        track, 
        isPlaying: true,
        progressMs: 0 
      }).catch(() => {});
    }
    
    return success;
  },
    
  togglePlayPause: () => 
    set((state) => {
      const isPlaying = !state.isPlaying && state.currentTrack !== null;
      if (state.currentTrack?.provider === 'spotify' && state.spotifyPlayer) {
        state.spotifyPlayer.togglePlay();
      }
      
      window.electronAPI.invoke('update-discord-presence', { 
        track: state.currentTrack, 
        isPlaying,
        progressMs: Math.floor(state.progressMs)
      }).catch(() => {});
      
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
      spotifyPlayer.setVolume(v * v);
    }
    window.electronAPI.invoke('update-setting', { key: 'volume', value: v });
  },

  setProgress: (ms) => 
    set({ progressMs: ms }),

  nextTrack: async () => {
    const { queue, currentTrack, isShuffle, repeatMode, hardStopAll } = get();
    if (!currentTrack || queue.length === 0) return;

    const requestId = Math.random().toString(36).substring(7);
    set({ isLoadingTrack: true, lastRequestId: requestId });
    console.log(`[Store] nextTrack started. RequestId: ${requestId}`);
    
    await hardStopAll();

    const currentIndex = queue.findIndex((t: any) => t.id === currentTrack.id);
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
      
      // ПРЕДВАРИТЕЛЬНОЕ ОБНОВЛЕНИЕ ХРАНИЛИЩА (СТРОГАЯ ИЗОЛЯЦИЯ)
      const state = get();
      if (state.currentTrack?.provider === 'spotify' && next.provider !== 'spotify' && state.spotifyPlayer) {
        console.log('[Store] nextTrack: Switching FROM Spotify, awaiting pause...');
        await state.spotifyPlayer.pause().catch(() => {});
      }
      
      set({ currentTrack: next, isPlaying: true, progressMs: 0, durationMs: next.durationMs, isLoadingTrack: false });

      // Для Spotify используем кастомный IPC, который обращается к Web SDK
      if (next.provider === 'spotify') {
        const { spotifyDeviceId } = get();
        try {
          await window.electronAPI.invoke('play-spotify-uri', {
            deviceId: spotifyDeviceId || undefined,
            trackId: next.id
          });
          
          // Проверка: не переключил ли пользователь трек, пока мы ждали Spotify?
          if (get().currentTrack?.id !== next.id) {
             console.log('[usePlayerStore] Spotify play aborted: track changed during IPC');
             return;
          }
          
          set({ currentTrack: next, isPlaying: true, isLoadingTrack: false });
        } catch (e) {
          console.error(e);
        }
      } else {
        const streamUrl = await window.electronAPI.invoke('play-track', { 
          providerId: next.provider, 
          trackId: next.id 
        });

        // ПРОВЕРКА REQUEST ID (ЗАЩИТА ОТ ПОВТОРНЫХ ВЫЗОВОВ)
        if (get().lastRequestId !== requestId) {
          console.log(`[Store] nextTrack (Native): old request ${requestId} ignored`);
          return;
        }

        // Проверка: не переключил ли пользователь трек, пока мы ждали streamUrl?
        if (get().currentTrack?.id !== next.id) {
          console.log('[usePlayerStore] Native play aborted: track changed during stream fetch');
          return;
        }

        if (streamUrl) {
          console.log(`[Store] nextTrack (Native): playing with URL. RequestId: ${requestId}`);
          set({ currentTrack: { ...next, streamUrl }, isPlaying: true, isLoadingTrack: false });
        }
      }
      
      window.electronAPI.invoke('update-discord-presence', { 
        track: next, 
        isPlaying: true,
        progressMs: 0
      }).catch(() => {});
    }
  },

  prevTrack: async () => {
    const { queue, currentTrack, hardStopAll } = get();
    if (!currentTrack || queue.length === 0) return;

    const requestId = Math.random().toString(36).substring(7);
    set({ isLoadingTrack: true, lastRequestId: requestId });
    console.log(`[Store] prevTrack started. RequestId: ${requestId}`);
    
    await hardStopAll();

    const currentIndex = queue.findIndex((t: any) => t.id === currentTrack.id);
    if (currentIndex > 0) {
      const prev = queue[currentIndex - 1];

      // ПРЕДВАРИТЕЛЬНОЕ ОБНОВЛЕНИЕ ХРАНИЛИЩА (СТРОГАЯ ИЗОЛЯЦИЯ)
      const state = get();
      if (state.currentTrack?.provider === 'spotify' && prev.provider !== 'spotify' && state.spotifyPlayer) {
        console.log('[Store] prevTrack: Switching FROM Spotify, awaiting pause...');
        await state.spotifyPlayer.pause().catch(() => {});
      }

      set({ currentTrack: prev, isPlaying: true, progressMs: 0, durationMs: prev.durationMs, isLoadingTrack: false });

      if (prev.provider === 'spotify') {
        const { spotifyDeviceId } = get();
        try {
          await window.electronAPI.invoke('play-spotify-uri', {
            deviceId: spotifyDeviceId || undefined,
            trackId: prev.id
          });
          
          // ВОССТАНОВЛЕНИЕ ГРОМКОСТИ (после hardStopAll)
          if (state.spotifyPlayer) {
            state.spotifyPlayer.setVolume(state.volume * state.volume).catch(() => {});
          }

          // Проверка: не переключил ли пользователь трек?
          if (get().currentTrack?.id !== prev.id) return;

          set({ currentTrack: prev, isPlaying: true, isLoadingTrack: false });
        } catch (e) {
          console.error(e);
        }
      } else {
        const streamUrl = await window.electronAPI.invoke('play-track', { 
          providerId: prev.provider, 
          trackId: prev.id 
        });

        // Проверка: не переключил ли пользователь трек?
        if (get().currentTrack?.id !== prev.id) return;

        if (streamUrl) {
          set({ currentTrack: { ...prev, streamUrl }, isPlaying: true, isLoadingTrack: false });
        }
      }
      
      window.electronAPI.invoke('update-discord-presence', { 
        track: prev, 
        isPlaying: true,
        progressMs: 0
      }).catch(() => {});
    }
  },

  setQueue: (queue) => set({ queue }),
  addToQueue: (tracks: Track[]) => set((state: any) => ({ queue: [...state.queue, ...tracks] })),
  setCurrentTrack: (track) => {
    const { spotifyPlayer } = get();
    if (track && track.provider !== 'spotify' && spotifyPlayer) {
      spotifyPlayer.pause().catch(() => {});
    }
    set({ currentTrack: track, progressMs: 0, durationMs: track?.durationMs || 0, isLoadingTrack: false });
  },
  setIsPlaying: (isPlaying) => {
    // ЗАЩИТА: Игнорируем команду паузы (false), если мы прямо сейчас загружаем новый трек.
    // Предотвращает "дребезг" от прошлых движков (особенно Spotify SDK).
    if (get().isLoadingTrack && !isPlaying) {
      console.log('[Store] setIsPlaying(false) ignored during isLoadingTrack');
      return;
    }
    set({ isPlaying });
    window.electronAPI.invoke('update-discord-presence', { 
      track: get().currentTrack, 
      isPlaying,
      progressMs: get().progressMs 
    }).catch(() => {});
  },
  isLoadingTrack: false,
  setIsLoadingTrack: (isLoadingTrack) => set({ isLoadingTrack }),
  lastRequestId: null,
  setLastRequestId: (lastRequestId) => set({ lastRequestId }),
  
  hardStopAll: async () => {
    const state = get();
    console.log('[Store] Executing hardStopAll...');
    
    // 1. Сброс состояния воспроизведения в UI
    set({ isPlaying: false });
    window.electronAPI.invoke('update-discord-presence', { 
      track: get().currentTrack, 
      isPlaying: false,
      progressMs: get().progressMs
    }).catch(() => {});

    // 2. Мгновенная остановка нативного тега <audio> через прямой доступ к DOM
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(el => {
      el.pause();
      el.src = '';
      el.load(); // Очистка буфера
    });

    // 3. Остановка Spotify Web SDK
    if (state.spotifyPlayer) {
      // Мгновенное подавление звука ТОЛЬКО если мы уходим со Spotify
      // Если мы ИДЕМ на Spotify, то громкость будет восстановлена в playTrack
      state.spotifyPlayer.setVolume(0).catch(() => {});
      
      // Не ждем паузу (await), если мы сразу же включим другой трек в Spotify
      // Это предотвращает ошибку "no list loaded"
      state.spotifyPlayer.pause().catch(() => {});
      console.log('[Store] Spotify stop (non-blocking) executed.');
    }

    // 4. Остановка Rust-движков (SoundCloud worker и т.д.)
    await (window as any).electronAPI.invoke('stop-all-audio').catch(() => {});
    
    console.log('[Store] hardStopAll completed.');
  },
  
  setLyricsOpen: (open) => set({ isLyricsOpen: open }),
  
  fetchLyrics: async (track) => {
    set({ lyrics: null });
    try {
      const data = await (window as any).electronAPI.invoke('get-lyrics', {
        artist: track.artist,
        title: track.title,
        duration: track.durationMs ? Math.round(track.durationMs / 1000) : undefined
      });
      set({ lyrics: data });
    } catch (e) {
      console.error('[Store] fetchLyrics error:', e);
      set({ lyrics: null });
    }
  },
  
  setDurationMs: (ms) => set({ durationMs: ms }),
  
  syncState: (data) => set(data)
}));
