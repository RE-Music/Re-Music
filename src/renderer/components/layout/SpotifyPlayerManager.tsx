import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';

export const SpotifyPlayerManager: React.FC = () => {
  const { setSpotifyPlayer, setSpotifyDeviceId, setIsPlaying, setProgress, currentTrack, nextTrack } = usePlayerStore();
  const playerRef = useRef<any>(null);
  const isAdvancingRef = useRef(false);

  useEffect(() => {
    // We only want to initialize once
    if (playerRef.current) return;

    const initializeSDK = async () => {
      console.log('[SpotifyPlayerManager] Initializing Spotify Web SDK');

      // The SDK calls getOAuthToken whenever it needs a valid token
      const player = new window.Spotify.Player({
        name: 'Nano-Mus',
        getOAuthToken: async (cb: (token: string) => void) => {
          try {
            const api = (window as any).electronAPI;
            if (!api || typeof api.invoke !== 'function') {
              console.error('[SpotifyPlayerManager] window.electronAPI.invoke is not available! Cannot fetch token.');
              return;
            }
            const token = await api.invoke('get-spotify-token');
            if (token) {
              cb(token);
            } else {
              console.error('[SpotifyPlayerManager] Could not retrieve Spotify token');
            }
          } catch (e) {
            console.error('[SpotifyPlayerManager] Token fetch error:', e);
          }
        },
        volume: 1.0
      });

      // Error handling
      player.addListener('initialization_error', ({ message }: any) => {
        console.error('[SpotifyPlayerManager] Initialization Error:', message);
      });
      player.addListener('authentication_error', ({ message }: any) => {
        console.error('[SpotifyPlayerManager] Authentication Error:', message);
      });
      player.addListener('account_error', ({ message }: any) => {
        console.error('[SpotifyPlayerManager] Account Error:', message);
      });
      player.addListener('playback_error', ({ message }: any) => {
        console.error('[SpotifyPlayerManager] Playback Error:', message);
      });

      // Playback status updates
      player.addListener('player_state_changed', (state: any) => {
        if (!state) return;
        
        // ONLY update global isPlaying if the current track in store IS a Spotify track
        // This prevents "zombie" or background Spotify events from hijacking the UI/State 
        // when we are actually listening to Yandex or another provider.
        const currentStoreTrack = usePlayerStore.getState().currentTrack;
        if (currentStoreTrack?.provider === 'spotify') {
          setIsPlaying(!state.paused);
          setProgress(state.position);
        }

        // state.track_window.current_track contains info about what's physically playing
        // We can detect track end via state changes if position === 0 and paused === true, 
        // but often 'player_state_changed' is sufficient to keep our store updated.
        if (state.position === 0 && state.paused && state.restrictions.disallow_resuming_reasons?.includes('not_paused')) {
           // Possible track end, but we handle it via standard interval checks or nextTrack hooks
        }
      });

      // Ready
      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('[SpotifyPlayerManager] Ready with Device ID', device_id);
        if (player.activateElement) {
          player.activateElement().catch(() => {});
        }
        setSpotifyDeviceId(device_id);
      });

      // Not Ready
      player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        console.log('[SpotifyPlayerManager] Device ID has gone offline', device_id);
        setSpotifyDeviceId(null);
      });

      // Connect to the player!
      const connected = await player.connect();
      if (connected) {
        console.log('[SpotifyPlayerManager] Successfully connected SDK');
        playerRef.current = player;
        setSpotifyPlayer(player);
      }
    };

    const spotifyReady = (window as any).Spotify || (window as any)._spotifyReady;

    if (spotifyReady) {
      initializeSDK();
    } else {
      (window as any)._spotifyInitCallback = initializeSDK;
    }

    return () => {
      if (playerRef.current) {
        console.log('[SpotifyPlayerManager] Disconnecting SDK on unmount (cleanup)');
        playerRef.current.disconnect();
        playerRef.current = null;
        setSpotifyDeviceId(null);
      }
    };
  }, [setSpotifyPlayer, setSpotifyDeviceId, setIsPlaying, setProgress]);

  // Ensure Spotify pauses if another provider takes over playback
  useEffect(() => {
    if (currentTrack?.provider !== 'spotify' && playerRef.current) {
      console.log(`[SpotifyPlayerManager] Stopping Spotify playback. Active provider: ${currentTrack?.provider}`);
      isAdvancingRef.current = false;
      playerRef.current.setVolume(0).catch(() => {});
      playerRef.current.pause().catch((err: any) => {
        console.warn('[SpotifyPlayerManager] Pause failed:', err);
      });
    }
  }, [currentTrack?.id, currentTrack?.provider]);

  // Sync Progress visually for Spotify tracks (since the SDK only emits state changes intermittently)
  useEffect(() => {
    const interval = setInterval(async () => {
      const state = usePlayerStore.getState();
      if (state.isPlaying && state.currentTrack?.provider === 'spotify' && playerRef.current) {
        const playerState = await playerRef.current.getCurrentState();
        if (playerState && !playerState.paused) {
          // Попытка "разбудить" плеер, если он в фоне
          if (playerRef.current.activateElement) {
            playerRef.current.activateElement().catch(() => {});
          }
          setProgress(playerState.position);
          
          // Проверяем конец трека (за 1.5 секунды до конца)
          const isAtEnd = playerState.position > 0 && playerState.position >= playerState.duration - 1500;
          
          if (isAtEnd && !isAdvancingRef.current) {
            console.log('[SpotifyPlayerManager] Track end detected, advancing...');
            isAdvancingRef.current = true;
            
            // Глушим звук СРАЗУ
            await playerRef.current.setVolume(0).catch(() => {});
            
            console.log('[SpotifyPlayerManager] Calling nextTrack() due to end of Spotify track');
            // Переключаем
            nextTrack();
            
            // Сбрасываем флаг через 3 секунды (защита от дребезга)
            setTimeout(() => { isAdvancingRef.current = false; }, 3000);
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [nextTrack, setProgress]);

  return null; // Hidden component purely for logic
};
