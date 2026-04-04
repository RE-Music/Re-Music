import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';

const commandMap: Record<string, string> = {
  'get-providers': 'get_providers',
  'get-settings': 'get_settings',
  'get-eq-state': 'get_eq_state',
  'save-eq-state': 'save_eq_state',
  'check-auth': 'check_auth',
  'get-auth-details': 'get_auth_details',
  'get-liked-tracks': 'get_liked_tracks',
  'update-setting': 'update_setting',
  'logout-provider': 'logout_provider',
  'auth-provider': 'auth_provider',
  'search': 'search',
  'get-playlists': 'get_playlists',
  'get-playlist-tracks': 'get_playlist_tracks',
  'play-track': 'get_stream_url',
  'get-track-radio': 'get_track_radio',
  'get-my-wave': 'get_my_wave',
  'like-track': 'like_track',
  'get-achievements': 'get_achievements',
  'unlock-achievement': 'unlock_achievement',
  'stop-all-audio': 'stop_all_audio',
};

export const tauriBridge = {
  async invoke(command: string, rawArgs: any = {}): Promise<any> {
    const tauriCommand = commandMap[command] || command.replace(/-/g, '_');
    try {
      // 1. Get the invoke function Safely (V28 Royale: Import -> Global Fallback)
      let invokeFn: any = null;
      try {
        invokeFn = invoke;
      } catch (e) {
        // Fallback to global if import failed or is being weird
        invokeFn = (window as any)?.__TAURI__?.core?.invoke;
      }

      if (!invokeFn || typeof invokeFn !== 'function') {
        const errorMsg = `Tauri 'invoke' is not available. Please ensure you are running within the Tauri environment.`;
        console.error(`[TauriBridge] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // 2. Auto-wrap simple arguments into objects
      let args: Record<string, any> = {};
      if (rawArgs === undefined || rawArgs === null) {
        // No arguments
      } else if (typeof rawArgs === 'string' || typeof rawArgs === 'number' || typeof rawArgs === 'boolean') {
        if (command === 'auth-provider' || command === 'logout-provider' || command === 'get-playlists' || command === 'unlock-achievement') {
          args = { [command === 'unlock-achievement' ? 'id' : 'providerId']: rawArgs };
        } else if (command === 'get-playlist-tracks') {
          args = { playlistId: rawArgs };
        } else if (command === 'play-track') {
          args = { trackId: rawArgs };
        } else {
          args = { value: rawArgs };
        }
      } else if (Array.isArray(rawArgs)) {
        if (command === 'get-my-wave') {
          args = { providersList: rawArgs };
        } else {
          args = { value: rawArgs };
        }
      } else {
        args = { ...rawArgs };
      }
      
      console.log(`[TauriBridge] Invoking ${tauriCommand} with args:`, JSON.stringify(args, null, 2));
      let result = await invokeFn(tauriCommand, args);
      
      // Auto-proxy wrapper (V28 Royale CORS-Free Stream Bridge)
      if (command === 'play-track' && typeof result === 'string') {
        const providerIdArg = (args as any).providerId;
        
        // If the result is already a proxy URL, try to extract the provider from it
        const match = result.match(/^nmis-proxy:\/\/([^\/]+)\//);
        const resolvedProviderId = providerIdArg || (match ? match[1] : 'yandex');
        
        if (resolvedProviderId !== 'spotify') {
            // Strip any existing proxy prefix to avoid double wrapping
            const cleanUrl = result.replace(/^nmis-proxy:\/\/[^\/]+\//, '')
                                   .replace(/^http:\/\/127\.0\.0\.1:5189\/[^\/]+\//, '');
            // Use standard HTTP localhost proxy for maximum CORS compatibility in dev mode
            result = `http://127.0.0.1:5189/${resolvedProviderId}/${encodeURIComponent(cleanUrl)}`;
        }
      }

      return result;
    } catch (error: any) {
      console.error(`[TauriBridge] Error in tauriBridge.invoke for ${command} (${tauriCommand}):`, error);
      throw error;
    }
  },
  on(channel: string, callback: any) {
    const unlistenPromise = listen(channel, (event) => {
      callback(event.payload);
    });
    return () => {
      unlistenPromise.then(fn => fn());
    };
  },
  emit(channel: string, payload: any) {
    emit(channel, payload);
  }
};
