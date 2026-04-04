import type { IMusicProvider, Track, Playlist } from '../../../shared/interfaces/IMusicProvider';
import { HttpClient } from '../../core/network/HttpClient';
import { AuthManager } from '../../core/auth/AuthManager';
import { Logger } from '../../core/error-handling/Logger';
import { shell } from 'electron';

export class SpotifyProvider implements IMusicProvider {
  public readonly id = 'spotify';
  public readonly name = 'Spotify';
  private httpClient: HttpClient;
  
  constructor(private authManager: AuthManager) {
    this.httpClient = new HttpClient('https://api.spotify.com/v1');
  }

  async auth(): Promise<boolean> {
    try {
      let token = await this.authManager.getToken(this.id);
      
      if (!token) {
        Logger.info('[SpotifyProvider] Starting OAuth Flow');
        token = await this.authManager.startOAuthFlow(this.id, {
          clientId: '7e458b019229459ba73be9671a018eb7',
          scopes: [
            'user-read-private', 
            'streaming', 
            'user-library-read', 
            'playlist-read-private',
            'user-read-playback-state',
            'user-modify-playback-state',
            'user-read-currently-playing'
          ],
          authUrl: 'https://accounts.spotify.com/authorize',
          tokenUrl: 'https://accounts.spotify.com/api/token',
        });
      }
      
      this.httpClient.setAuthorizationHeader(token);
      Logger.info('[SpotifyProvider] Auth successful');
      return true;
    } catch (e: any) {
      Logger.error('[SpotifyProvider] Auth failed', e);
      return false;
    }
  }

  async play(trackId: string, options?: { deviceId?: string }): Promise<void> {
    try {
      const url = options?.deviceId ? `/me/player/play?device_id=${options.deviceId}` : '/me/player/play';
      await this.httpClient.put<void>(url, { uris: [`spotify:track:${trackId}`] });
    } catch (e: any) {
      // 404 = No active device, 403 = Forbidden (e.g., Free tier)
      if (e.response?.status === 404 || e.response?.status === 403 || e.status === 404 || e.status === 403) {
        Logger.warn('[SpotifyProvider] Playback failed with 404/403. Falling back to native Spotify app.');
        shell.openExternal(`spotify:track:${trackId}`);
      } else {
        Logger.error('[SpotifyProvider] Playback error:', e);
      }
    }
  }

  async pause(options?: { deviceId?: string }): Promise<void> {
    const url = options?.deviceId ? `/me/player/pause?device_id=${options.deviceId}` : '/me/player/pause';
    await this.httpClient.put<void>(url);
  }

  async search(query: string, page: number = 1): Promise<Track[]> {
    try {
      const offset = (page - 1) * 20;
      const data = await this.httpClient.get<any>(`/search?q=${encodeURIComponent(query)}&type=track&limit=20&offset=${offset}`);
      if (!data || !data.tracks || !data.tracks.items) return [];
      
      return data.tracks.items.map((item: any) => ({
        id: item.id,
        title: item.name,
        artist: item.artists.map((a: any) => a.name).join(', '),
        durationMs: item.duration_ms,
        provider: this.id
      }));
    } catch (error: any) {
      if (error.message === 'UNAUTHORIZED') {
        Logger.warn('[SpotifyProvider] Token expired during search. Re-authenticating...');
        await this.authManager.refreshToken(this.id);
        const reAuth = await this.auth();
        if (reAuth) return this.search(query);
      }
      throw error;
    }
  }

  async getPlaylists(): Promise<Playlist[]> {
    const data = await this.httpClient.get<any>('/me/playlists');
    return data.items.map((item: any) => ({
      id: item.id,
      title: item.name,
      coverUrl: item.images?.[0]?.url,
      trackCount: item.tracks?.total || 0
    }));
  }

  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    try {
      const data = await this.httpClient.get<any>(`/playlists/${playlistId}/tracks`);
      if (!data || !data.items) return [];

      return data.items
        .filter((item: any) => item && item.track && item.track.id)
        .map((item: any) => {
          const track = item.track;
          return {
            id: track.id,
            title: track.name,
            artist: track.artists ? track.artists.map((a: any) => a.name).join(', ') : 'Unknown Artist',
            durationMs: track.duration_ms || 0,
            coverUrl: track.album?.images?.[0]?.url,
            provider: this.id
          };
        });
    } catch (e) {
      Logger.error('[SpotifyProvider] Failed to get playlist tracks', e);
      return [];
    }
  }

  async getLikedTracks(): Promise<Track[]> {
    if (!await this.auth()) return [];
    try {
      // Increased depth: Fetch 500 tracks in parallel batches
      const batchPromises = [];
      for (let offset = 0; offset < 500; offset += 50) {
        batchPromises.push(
          this.httpClient.get<any>(`/me/tracks?limit=50&offset=${offset}`).catch(() => ({ items: [] }))
        );
      }
      
      const results = await Promise.all(batchPromises);
      const allItems = results.flatMap(data => data.items || []);
      
      return allItems
        .filter((item: any) => item && item.track && item.track.id)
        .map((item: any) => ({
          id: item.track.id,
          title: item.track.name,
          artist: item.track.artists ? item.track.artists.map((a: any) => a.name).join(', ') : 'Unknown Artist',
          durationMs: item.track.duration_ms || 0,
          coverUrl: item.track.album?.images?.[0]?.url,
          provider: this.id,
          likedAt: item.added_at ? (typeof item.added_at === 'number' ? item.added_at : new Date(item.added_at).getTime()) : undefined
        }));
    } catch (e) {
      Logger.error('[SpotifyProvider] Failed to fetch liked tracks', e);
      return [];
    }
  }

  async likeTrack(trackId: string, like: boolean): Promise<boolean> {
    try {
      if (like) {
        await this.httpClient.put<void>(`/me/tracks?ids=${trackId}`, {});
      } else {
        await this.httpClient.delete<void>(`/me/tracks?ids=${trackId}`);
      }
      return true;
    } catch (e) {
      Logger.error('[SpotifyProvider] Failed to toggle like', e);
      return false;
    }
  }

  async addTrackToPlaylist(playlistId: string, trackId: string): Promise<boolean> {
    try {
      await this.httpClient.post<void>(`/playlists/${playlistId}/tracks`, {
        uris: [`spotify:track:${trackId}`]
      });
      return true;
    } catch (e) {
      Logger.error('[SpotifyProvider] Failed to add track to playlist', e);
      return false;
    }
  }

  async getRecommendations(seedTrackId?: string): Promise<Track[]> {
    try {
      let seeds = seedTrackId;
      
      // Если семени нет, берем последние лайки пользователя (до 5 штук по лимиту Spotify)
      if (!seeds) {
        const liked = await this.getLikedTracks();
        if (liked.length > 0) {
          seeds = liked.slice(0, 5).map(t => t.id).join(',');
        }
      }

      if (!seeds) {
        Logger.warn('[SpotifyProvider] No seeds available for recommendations');
        return [];
      }

      const data = await this.httpClient.get<any>(`/recommendations?seed_tracks=${seeds}&limit=20`);
      if (!data || !data.tracks) return [];

      return data.tracks.map((item: any) => ({
        id: item.id,
        title: item.name,
        artist: item.artists.map((a: any) => a.name).join(', '),
        durationMs: item.duration_ms,
        coverUrl: item.album?.images?.[0]?.url,
        provider: this.id
      }));
    } catch (error: any) {
      if (error.message === 'UNAUTHORIZED') {
        Logger.warn('[SpotifyProvider] Token expired during recommendations. Re-authenticating...');
        await this.authManager.refreshToken(this.id);
        const reAuth = await this.auth();
        if (reAuth) return this.getRecommendations(seedTrackId);
      }
      Logger.error(`[SpotifyProvider] getRecommendations failed`, error);
      return [];
    }
  }

  async getUserInfo(): Promise<{ username: string; avatarUrl?: string } | null> {
    try {
      // Use a shorter internal timeout to avoid blocking Settings view
      const data = await this.httpClient.get<any>('/me', { timeout: 7000 });
      return {
        username: data.display_name,
        avatarUrl: data.images?.[0]?.url
      };
    } catch (e) {
      // Return null immediately on 401/error to unblock UI
      return null;
    }
  }
}
