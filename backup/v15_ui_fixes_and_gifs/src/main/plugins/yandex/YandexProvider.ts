import type { IMusicProvider, Track, Playlist } from '../../../shared/interfaces/IMusicProvider';
import { HttpClient } from '../../core/network/HttpClient';
import { AuthManager } from '../../core/auth/AuthManager';
import { Logger } from '../../core/error-handling/Logger';

export class YandexProvider implements IMusicProvider {
  public readonly id = 'yandex';
  public readonly name = 'Yandex Music';
  private httpClient: HttpClient;
  private uid: string | null = null;
  
  constructor(private authManager: AuthManager) {
    this.httpClient = new HttpClient('https://api.music.yandex.net', {
      'X-Yandex-Music-Client': 'WindowsPhone/1.39',
      'User-Agent': 'Yandex-Music-Web/1.0',
      'Accept': 'application/json',
      'Accept-Language': 'ru'
    });
  }

  private async getUid(): Promise<string> {
    if (this.uid) return this.uid;
    
    try {
      const data = await this.httpClient.get<any>('/account/status');
      if (data.result?.account?.uid) {
        this.uid = String(data.result.account.uid);
        Logger.info(`[YandexProvider] Discovered UID: ${this.uid}`);
        return this.uid;
      }
      throw new Error('UID not found in account status');
    } catch (e) {
      Logger.error('[YandexProvider] Failed to get UID', e);
      throw e;
    }
  }

  private async ensureAuth(): Promise<boolean> {
    const token = await this.authManager.getToken(this.id);
    if (token) {
      this.httpClient.setAuthorizationHeader(token, 'OAuth');
      return true;
    }
    return false;
  }

  async auth(): Promise<boolean> {
    try {
      let token = await this.authManager.getToken(this.id);

      if (!token) {
        Logger.info('[YandexProvider] Checking for token via login window...');
        token = await this.authManager.getYandexTokenViaLoginWindow();
      }

      if (token) {
        this.httpClient.setAuthorizationHeader(token, 'OAuth');
        // Сразу пробуем получить UID после авторизации
        await this.getUid().catch(() => {}); 
        Logger.info('[YandexProvider] Auth successful and header set');
        return true;
      }
      return false;
    } catch (e: any) {
      Logger.error('[YandexProvider] Auth failed', e);
      return false;
    }
  }

  async play(trackId: string): Promise<string> {
    await this.ensureAuth();
    try {
      const infoData = await this.httpClient.get<any>(`/tracks/${trackId}/download-info`, {
        headers: { 
          'X-Yandex-Music-Client': 'WindowsPhone/1.39',
          'User-Agent': 'Yandex-Music-Web/1.0'
        }
      });
      const downloadInfoUrl = infoData.result?.[0]?.downloadInfoUrl;
      
      if (!downloadInfoUrl) throw new Error('Download info not found');

      const { data: trackInfo } = await this.httpClient.axiosInstance.get(`${downloadInfoUrl}&format=json`);
      
      const { host, path, s, ts } = trackInfo;
      const secret = 'Xgr';
      
      const crypto = require('crypto');
      const sign = crypto.createHash('md5')
        .update(secret + path.substring(1) + s)
        .digest('hex');

      const streamUrl = `https://${host}/get-mp3/${sign}/${ts}${path}`;
      Logger.info(`[YandexProvider] Stream URL generated for ${trackId}`);
      return streamUrl;
    } catch (e: any) {
      Logger.error('[YandexProvider] Failed to get stream URL', e);
      throw e;
    }
  }

  async pause(): Promise<void> {
    return Promise.resolve();
  }

  async search(query: string, page: number = 1): Promise<Track[]> {
    try {
      const data = await this.httpClient.get<any>(`/search?text=${encodeURIComponent(query)}&type=all&page=${page - 1}`, {
        headers: { 
          'X-Yandex-Music-Client': 'WindowsPhone/1.39',
          'User-Agent': 'Yandex-Music-Web/1.0'
        }
      });
      if (!data.result || !data.result.tracks || !data.result.tracks.results) {
        Logger.warn('[YandexProvider] Search returned no tracks in result');
        return [];
      }
      
      return data.result.tracks.results.map((track: any) => {
        const albumId = track.albums?.[0]?.id;
        const fullId = albumId ? `${track.id}:${albumId}` : String(track.id);
        
        return {
          id: fullId,
          title: track.title,
          artist: track.artists.map((a: any) => a.name).join(', '),
          durationMs: track.durationMs,
          coverUrl: track.coverUri ? `https://${track.coverUri.replace('%%', '200x200')}` : undefined,
          provider: this.id
        };
      });
    } catch (e: any) {
      Logger.error('[YandexProvider] Search failed', e);
      return [];
    }
  }

  async getPlaylists(): Promise<Playlist[]> {
    await this.ensureAuth();
    try {
      const uid = await this.getUid();
      const data = await this.httpClient.get<any>(`/users/${uid}/playlists/list`, {
        headers: { 
          'X-Yandex-Music-Client': 'WindowsPhone/1.39',
          'User-Agent': 'Yandex-Music-Web/1.0'
        }
      });
      
      if (!data.result) {
        Logger.warn('[YandexProvider] No playlists found in result');
        return [];
      }
      
      Logger.info(`[YandexProvider] Fetched ${data.result.length} playlists`);
      return data.result.map((item: any) => ({
        id: `${item.uid}:${item.kind}`,
        title: item.title,
        coverUrl: item.cover?.uri ? `https://${item.cover.uri.replace('%%', '200x200')}` : undefined,
        trackCount: item.trackCount
      }));
    } catch (e) {
      Logger.error('[YandexProvider] Failed to fetch playlists', e);
      return [];
    }
  }

  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    await this.ensureAuth();
    try {
      const [uid, kind] = playlistId.split(':');
      const data = await this.httpClient.get<any>(`/users/${uid}/playlists/${kind}`, {
        headers: { 
          'X-Yandex-Music-Client': 'WindowsPhone/1.39',
          'User-Agent': 'Yandex-Music-Web/1.0'
        }
      });
      
      if (!data.result?.tracks) return [];
      
      return data.result.tracks.map((item: any) => {
        const track = item.track;
        if (!track) return null;
        // Используем формат id:albumId если доступно, для надежности лайков
        const albumId = track.albums?.[0]?.id;
        const fullId = albumId ? `${track.id}:${albumId}` : String(track.id);
        
        return {
          id: fullId,
          title: track.title,
          artist: track.artists.map((a: any) => a.name).join(', '),
          durationMs: track.durationMs,
          coverUrl: track.coverUri ? `https://${track.coverUri.replace('%%', '200x200')}` : undefined,
          provider: this.id
        };
      }).filter(Boolean);
    } catch (e) {
      Logger.error('[YandexProvider] Failed to fetch playlist tracks', e);
      return [];
    }
  }

  async likeTrack(trackId: string, like: boolean): Promise<boolean> {
    await this.ensureAuth();
    try {
      const uid = await this.getUid();
      const endpoint = like ? 'add-multiple' : 'remove';
      // trackId может быть уже в формате trackId:albumId
      await this.httpClient.post(`/users/${uid}/likes/tracks/${endpoint}`, `track-ids=${trackId}`, {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Yandex-Music-Client': 'WindowsPhone/1.39'
        }
      });
      Logger.info(`[YandexProvider] Track ${trackId} ${like ? 'liked' : 'unliked'}`);
      return true;
    } catch (e) {
      Logger.error('[YandexProvider] Failed to toggle like', e);
      return false;
    }
  }

  async createPlaylist(title: string): Promise<Playlist | boolean> {
    await this.ensureAuth();
    try {
      const uid = await this.getUid();
      // Используем multipart-подобный или обычный urlencoded, но с правильными заголовками
      const data = await this.httpClient.post<any>(`/users/${uid}/playlists/create`, `title=${encodeURIComponent(title)}&visibility=public`, {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Yandex-Music-Client': 'WindowsPhone/1.39'
        }
      });
      
      if (data.result) {
        const item = data.result;
        Logger.info(`[YandexProvider] Playlist created: ${item.title} (${item.kind})`);
        return {
          id: `${item.uid}:${item.kind}`,
          title: item.title,
          trackCount: 0
        };
      }
      Logger.warn('[YandexProvider] Create playlist returned no result');
      return false;
    } catch (e) {
      Logger.error('[YandexProvider] Failed to create playlist', e);
      return false;
    }
  }

  async getLikedTracks(): Promise<Track[]> {
    await this.ensureAuth();
    try {
      const uid = await this.getUid();
      Logger.info(`[YandexProvider] Fetching likes for UID ${uid}...`);
      const data = await this.httpClient.get<any>(`/users/${uid}/likes/tracks`, {
        headers: { 
          'X-Yandex-Music-Client': 'WindowsPhone/1.39',
          'User-Agent': 'Yandex-Music-Web/1.0'
        }
      });
      
      const likedItems = data.result?.library?.tracks || data.result?.tracks || [];
      Logger.info(`[YandexProvider] Liked items count: ${likedItems.length}`);
      
      if (likedItems.length === 0) return [];

      // Проверяем, есть ли там полные данные о треках
      if (likedItems[0].track) {
        return likedItems.map((item: any) => {
          const track = item.track;
          if (!track) return null;
          const albumId = track.albums?.[0]?.id;
          const fullId = albumId ? `${track.id}:${albumId}` : String(track.id);
          
          return {
            id: fullId,
            title: track.title,
            artist: track.artists.map((a: any) => a.name).join(', '),
            durationMs: track.durationMs,
            coverUrl: track.coverUri ? `https://${track.coverUri.replace('%%', '400x400')}` : undefined,
            provider: this.id,
            likedAt: item.timestamp ? new Date(item.timestamp).getTime() : undefined
          } as Track;
        }).filter(Boolean);
      } else {
        // Если только ID, нужно загрузить данные
        Logger.info('[YandexProvider] Fetching track details for likes...');
        // Сохраняем таймстампы из изначального списка
        const timestamps = new Map(likedItems.map((i: any) => [String(i.id), i.timestamp]));
        
        const trackIds = likedItems.map((item: any) => item.id).slice(0, 100).join(',');
        const tracksData = await this.httpClient.post<any>('/tracks', `track-ids=${trackIds}`, {
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Yandex-Music-Client': 'WindowsPhone/1.39'
          }
        });

        if (!tracksData.result) return [];

        return tracksData.result.map((track: any) => {
          const albumId = track.albums?.[0]?.id;
          const fullId = albumId ? `${track.id}:${albumId}` : String(track.id);
          const ts = timestamps.get(String(track.id));
          return {
            id: fullId,
            title: track.title,
            artist: track.artists.map((a: any) => a.name).join(', '),
            durationMs: track.durationMs,
            coverUrl: track.coverUri ? `https://${track.coverUri.replace('%%', '400x400')}` : undefined,
            provider: this.id,
            likedAt: ts ? new Date(ts as any).getTime() : undefined
          } as Track;
        });
      }
    } catch (e) {
      Logger.error('[YandexProvider] Failed to fetch liked tracks', e);
      return [];
    }
  }

  async addTrackToPlaylist(playlistId: string, trackId: string): Promise<boolean> {
    await this.ensureAuth();
    try {
      const uid = await this.getUid();
      const [, kind] = playlistId.split(':');
      // trackId может быть в формате id:albumId
      const [id, albumId] = trackId.split(':');
      
      // Яндекс требует revision для изменения плейлиста
      const playlistData = await this.httpClient.get<any>(`/users/${uid}/playlists/${kind}`, {
        headers: { 
          'X-Yandex-Music-Client': 'WindowsPhone/1.39',
          'User-Agent': 'Yandex-Music-Web/1.0'
        }
      });
      const revision = playlistData.result.revision;

      await this.httpClient.post(`/users/${uid}/playlists/${kind}/change-relative`, 
        `diff=[{"op":"insert","at":0,"tracks":[{"id":"${id}","albumId":"${albumId || ''}"}]}]&revision=${revision}`, {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Yandex-Music-Client': 'WindowsPhone/1.39'
        }
      });
      
      Logger.info(`[YandexProvider] Track ${trackId} added to playlist ${playlistId}`);
      return true;
    } catch (e) {
      Logger.error('[YandexProvider] Failed to add track to playlist', e);
      return false;
    }
  }

  async getRecommendations(seedTrackId?: string): Promise<Track[]> {
    await this.ensureAuth();
    try {
      // Глобальная "Моя волна" через случайный лайк (основа)
      if (!seedTrackId) {
        Logger.info('[YandexProvider] Seeding My Wave from liked tracks...');
        const liked = await this.getLikedTracks();
        if (liked.length === 0) {
          Logger.warn('[YandexProvider] No liked tracks to seed My Wave');
          return [];
        }
        const seed = liked[Math.floor(Math.random() * liked.length)];
        Logger.info(`[YandexProvider] Seed track: ${seed.title} (${seed.id})`);
        return await this.getRecommendations(seed.id);
      }

      // Волна по треку - РАБОЧАЯ ВЕРСИЯ (с полным ID и правильным from)
      // seedTrackId обычно в формате id:albumId
      const trackIdOnly = seedTrackId.split(':')[0];
      const stationId = seedTrackId.includes(':') ? `track:${seedTrackId}` : `track:${seedTrackId}`;
      
      Logger.info(`[YandexProvider] Fetching radio for: ${stationId}`);
      try {
        const data = await this.httpClient.get<any>(`/radio/v2/stations/${stationId}/tracks?from=desktop_vwave`, {
          headers: {
            'X-Yandex-Music-Client': 'WindowsPhone/1.39',
            'User-Agent': 'Yandex-Music-Web/1.0'
          }
        });
        if (data.result?.tracks) {
          return this.mapYandexTracks(data.result.tracks);
        }
      } catch (e: any) {
        Logger.warn(`[YandexProvider] Station ${stationId} failed, trying similar tracks`);
      }

      // Фоллбэк: Похожие треки (тоже всегда работало)
      const similarData = await this.httpClient.get<any>(`/tracks/${trackIdOnly}/similar`);
      if (similarData.result?.similarTracks) {
        return this.mapYandexTracks(similarData.result.similarTracks);
      }

      return [];
    } catch (e: any) {
      Logger.error(`[YandexProvider] getRecommendations failed:`, e.message);
      return [];
    }
  }

  private mapYandexTracks(yandexTracks: any[]): Track[] {
    if (!yandexTracks || !Array.isArray(yandexTracks)) return [];
    return yandexTracks.map((item: any) => {
      const track = item.track || item;
      if (!track || !track.id) return null;
      
      const albumId = track.albums?.[0]?.id;
      const fullId = albumId ? `${track.id}:${albumId}` : String(track.id);
      
      return {
        id: fullId,
        title: track.title,
        artist: track.artists ? track.artists.map((a: any) => a.name).join(', ') : 'Unknown Artist',
        durationMs: track.durationMs || 0,
        coverUrl: track.coverUri ? `https://${track.coverUri.replace('%%', '400x400')}` : undefined,
        provider: this.id
      } as Track;
    }).filter(Boolean) as Track[];
  }

  async getUserInfo(): Promise<{ username: string; avatarUrl?: string } | null> {
    await this.ensureAuth();
    try {
      const data = await this.httpClient.get<any>('/account/status', {
        headers: { 
          'X-Yandex-Music-Client': 'WindowsPhone/1.39',
          'User-Agent': 'Yandex-Music-Web/1.0'
        }
      });
      const account = data.result?.account;
      if (!account) return null;
      
      return {
        username: account.login || account.fullName || 'Yandex User',
        avatarUrl: account.avatarUri ? `https://${account.avatarUri.replace('%%', '200x200')}` : undefined
      };
    } catch (e) {
      return null;
    }
  }
}
