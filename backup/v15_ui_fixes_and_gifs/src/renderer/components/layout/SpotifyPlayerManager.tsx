import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';

export const SpotifyPlayerManager: React.FC = () => {
  const { setSpotifyPlayer, setSpotifyDeviceId, setIsPlaying, setProgress, currentTrack, nextTrack } = usePlayerStore();
  const playerRef = useRef<any>(null);

  useEffect(() => {
    // We only want to initialize once
    if (playerRef.current || !window.Spotify) return;

    const initializeSDK = async () => {
      console.log('[SpotifyPlayerManager] Initializing Spotify Web SDK');

      // The SDK calls getOAuthToken whenever it needs a valid token
      const player = new window.Spotify.Player({
        name: 'Nano-Mus',
        getOAuthToken: async (cb: (token: string) => void) => {
          try {
            const token = await window.electronAPI.invoke('get-spotify-token');
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
        
        setIsPlaying(!state.paused);
        setProgress(state.position);

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
        setSpotifyDeviceId(device_id);
      });

      // Not Ready
      player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        console.log('[SpotifyPlayerManager] Device ID has gone offline', device_id);
      });

      // Connect to the player!
      const connected = await player.connect();
      if (connected) {
        console.log('[SpotifyPlayerManager] Successfully connected SDK');
        playerRef.current = player;
        setSpotifyPlayer(player);
      }
    };

    if (window.Spotify) {
      initializeSDK();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initializeSDK;
    }

  }, [setSpotifyPlayer, setSpotifyDeviceId, setIsPlaying, setProgress]);

  // Sync Progress visually for Spotify tracks (since the SDK only emits state changes intermittently)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (usePlayerStore.getState().isPlaying && usePlayerStore.getState().currentTrack?.provider === 'spotify') {
      interval = setInterval(async () => {
        if (playerRef.current) {
          const state = await playerRef.current.getCurrentState();
          if (state && !state.paused) {
            setProgress(state.position);
            // Detect end of track
            if (state.position > 0 && state.position >= state.duration - 1000) {
              // We are at the end, let Nano-Mus handle queue advancement
              nextTrack();
            }
          }
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentTrack]); // Add explicit dependency on currentTrack

  return null; // Hidden component purely for logic
};
