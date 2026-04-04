import type { IMusicProvider, Track, Playlist } from '../../../shared/interfaces/IMusicProvider';
import { HttpClient } from '../../core/network/HttpClient';
import { AuthManager } from '../../core/auth/AuthManager';
import { Logger } from '../../core/error-handling/Logger';

export class SoundCloudProvider implements IMusicProvider {
  public readonly id = 'soundcloud';
  public readonly name = 'SoundCloud';
  private httpClient: HttpClient;
  private httpClientV1: HttpClient;
  private clientId: string = 'khI8ciOiYPX6UVGInQY5zA0zvTkfzuuC';
  
  constructor(private authManager: AuthManager) {
    this.httpClient = new HttpClient('https://api-v2.soundcloud.com', {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SoundCloud/233.0.0 (Desktop; Windows) Electron/26.6.1 Nmis/1.0.0',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9'
    }, 'persist:soundcloud_auth');
    
    // Клиент для старого v1 API — работает с oauth_token без ограничений по scope
    this.httpClientV1 = new HttpClient('https://api.soundcloud.com', {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SoundCloud/233.0.0 (Desktop; Windows) Electron/26.6.1 Nmis/1.0.0',
      'Accept': 'application/json, text/plain, */*',
    }, 'persist:soundcloud_auth');
  }

  async auth(): Promise<boolean> {
    try {
      const token = await this.authManager.getSoundCloudTokenViaLoginWindow();
      if (token) {
        this.httpClient.setAuthorizationHeader(token, 'OAuth');
        this.httpClientV1.setAuthorizationHeader(token, 'OAuth');
        this.userId = null;
        this.userInfo = null;
        return true;
      }
      return false;
    } catch (e) {
      Logger.error('[SoundCloudProvider] Auth failed', e);
      return false;
    }
  }

  private userId: string | null = null;
  private userInfo: any = null;
  private lastMeErrorTime: number = 0;

  private async getAuthorizedUrl(path: string, baseUrl: string = 'https://api-v2.soundcloud.com', includeToken: boolean = true): Promise<string> {
    const token = await this.authManager.getToken(this.id);
    const separator = path.includes('?') ? '&' : '?';
    const extraParams = 'app_version=1773418860&app_locale=en';
    
    if (token && includeToken) {
      this.httpClient.setAuthorizationHeader(token, 'OAuth');
      this.httpClientV1.setAuthorizationHeader(token, 'OAuth');
      if (baseUrl === 'https://api.soundcloud.com') {
        return `${path}${separator}oauth_token=${token}&client_id=${this.clientId}`;
      }
      return `${path}${separator}client_id=${this.clientId}&oauth_token=${token}&${extraParams}`;
    }
    return `${path}${separator}client_id=${this.clientId}&${extraParams}`;
  }

  private async getMe(): Promise<any> {
    if (this.userInfo) return this.userInfo;

    const now = Date.now();
    // Увеличенный кулдаун до 60 сек, если токен невалиден (401), чтобы не спамить
    if (now - this.lastMeErrorTime < 60000) {
      throw new Error('SoundCloud profile cooldown (auth failed recently)');
    }

    try {
      const url = await this.getAuthorizedUrl('/me');
      const data = await this.httpClient.get<any>(url);
      if (data && data.id) {
        this.userInfo = data;
        this.userId = String(data.id);
        Logger.info(`[SoundCloudProvider] Authorized as ${data.username} (ID: ${this.userId})`);
      }
      return data;
    } catch (e: any) {
      this.lastMeErrorTime = Date.now();
      throw e;
    }
  }

  async play(trackId: string): Promise<string> {
    try {
      const url = await this.getAuthorizedUrl(`/tracks/${trackId}`);
      const data = await this.httpClient.get<any>(url);
      const transcoding = data.media?.transcodings?.find((t: any) => t.format.protocol === 'progressive') || 
                          data.media?.transcodings?.find((t: any) => t.format.protocol === 'hls');
      
      if (!transcoding) throw new Error('No supported stream found');
      
      const streamUrl = await this.getAuthorizedUrl(transcoding.url);
      const streamData = await this.httpClient.get<any>(streamUrl);
      return streamData.url;
    } catch (e: any) {
      Logger.error('[SoundCloudProvider] Failed to get stream URL', e);
      throw e;
    }
  }

  async pause(): Promise<void> { return Promise.resolve(); }

  async search(query: string, page: number = 1): Promise<Track[]> {
    try {
      const offset = (page - 1) * 20;
      const url = await this.getAuthorizedUrl(`/search/tracks?q=${encodeURIComponent(query)}&limit=20&offset=${offset}`);
      const data = await this.httpClient.get<any>(url);
      return (data.collection || []).map((item: any) => this.mapTrack(item));
    } catch (e: any) {
      Logger.error('[SoundCloudProvider] Search failed', e);
      return [];
    }
  }

  async getPlaylists(): Promise<Playlist[]> {
    try {
      const user = await this.getMe();
      const url = await this.getAuthorizedUrl(`/users/${user.id}/playlists?limit=50`);
      const data = await this.httpClient.get<any>(url);
      
      return (data.collection || []).map((p: any) => ({
        id: String(p.id),
        title: p.title || 'Untitled',
        coverUrl: p.artwork_url || p.user?.avatar_url,
        trackCount: p.track_count || 0
      }));
    } catch (e) {
      Logger.error('[SoundCloudProvider] Failed to fetch playlists', e);
      return [];
    }
  }

  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    try {
      const url = await this.getAuthorizedUrl(`/playlists/${playlistId}`);
      const data = await this.httpClient.get<any>(url);
      return (data.tracks || []).map((item: any) => this.mapTrack(item));
    } catch (e) {
      Logger.error('[SoundCloudProvider] Failed to fetch playlist tracks', e);
      return [];
    }
  }

 

  // Скрытое окно для выполнения запросов с полными правами web-client (обход DataDome)
  private static workerWindow: import('electron').BrowserWindow | null = null;
  private static workerReady: Promise<void> | null = null;

  private async getWorkerWindow(): Promise<import('electron').BrowserWindow> {
    const { BrowserWindow } = require('electron');
    
    if (SoundCloudProvider.workerWindow && !SoundCloudProvider.workerWindow.isDestroyed()) {
        return SoundCloudProvider.workerWindow;
    }

    const win = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:soundcloud_auth'
      }
    });

    SoundCloudProvider.workerWindow = win;

    win.webContents.on('will-prevent-unload', (event: any) => event.preventDefault());

    SoundCloudProvider.workerReady = new Promise<void>((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => { if (!resolved) resolve(); }, 5000);

      win.webContents.once('did-finish-load', () => {
        resolved = true;
        clearTimeout(timeout);
        setTimeout(resolve, 200); 
      });

      win.loadURL('https://soundcloud.com');
    });

    await SoundCloudProvider.workerReady;
    return win;
  }

  async likeTrack(trackId: string, like: boolean): Promise<boolean> {
    const numericId = trackId.replace('soundcloud:tracks:', '');
    const token = await this.authManager.getToken(this.id);
    
    if (!token) {
      Logger.error('[SoundCloudProvider] No token available for like action');
      return false;
    }

    try {
      const myId = this.userId || (await this.getMe()).id;
      const worker = await this.getWorkerWindow();
      const method = like ? 'PUT' : 'DELETE';
      
      const endpoints = [
        `/me/track_likes/${numericId}`,
        `/users/${myId}/track_likes/${numericId}`
      ];

      for (const endpoint of endpoints) {
        try {
          const relativeUrl = await this.getAuthorizedUrl(endpoint, 'https://api-v2.soundcloud.com', false);
          const fullUrl = 'https://api-v2.soundcloud.com' + relativeUrl;
          
          Logger.info(`[SoundCloudProvider] Trying ${method} ${endpoint} via Worker...`);
          
          const result = await worker.webContents.executeJavaScript(`
            (async () => {
              try {
                const res = await fetch('${fullUrl}', {
                  method: '${method}',
                  headers: {
                    'Authorization': 'OAuth ${token}',
                    'Accept': 'application/json, text/plain, */*',
                    'Origin': 'https://soundcloud.com',
                    'Referer': 'https://soundcloud.com/'
                  }
                });
                return { ok: res.status >= 200 && res.status < 300, status: res.status };
              } catch (e) {
                return { ok: false, status: 0, error: e.message };
              }
            })()
          `);

          if (result.ok) {
            Logger.info(`[SoundCloudProvider] Like SUCCESS via ${endpoint}`);
            return true;
          } else {
            Logger.warn(`[SoundCloudProvider] Worker failed ${endpoint}: Status ${result.status}`);
          }
        } catch (e: any) {
          Logger.warn(`[SoundCloudProvider] Worker execution error for ${endpoint}: ${e.message}`);
        }
      }
    } catch (e: any) {
      Logger.error(`[SoundCloudProvider] Overall worker like failed: ${e.message}`);
    }

    return false;
  }

  async getLikedTracks(): Promise<Track[]> {
    try {
      const user = await this.getMe();
      const url = await this.getAuthorizedUrl(`/users/${user.id}/track_likes?limit=100`);
      const data = await this.httpClient.get<any>(url);
      
      return (data.collection || []).map((item: any) => {
        const track = item.track || item;
        let likedAt: number | undefined;
        if (item.created_at) {
          const parsed = new Date(item.created_at).getTime();
          if (!isNaN(parsed)) likedAt = parsed;
        }
        return this.mapTrack(track, likedAt);
      });
    } catch (e) {
      Logger.error('[SoundCloudProvider] Failed to fetch liked tracks', e);
      return [];
    }
  }

  async getRecommendations(seedTrackId?: string): Promise<Track[]> {
    try {
      let id = seedTrackId;
      
      // Если семени нет, берем последний лайк
      if (!id) {
        const liked = await this.getLikedTracks();
        if (liked.length > 0) {
          id = liked[0].id;
        }
      }

      if (!id) {
        Logger.warn('[SoundCloudProvider] No seeds available for recommendations');
        return [];
      }

      const cleanId = id.replace('soundcloud:tracks:', '');
      const url = await this.getAuthorizedUrl(`/tracks/${cleanId}/related?limit=20`);
      const data = await this.httpClient.get<any>(url);
      
      return (data.collection || []).map((item: any) => this.mapTrack(item));
    } catch (e: any) {
      Logger.error(`[SoundCloudProvider] getRecommendations failed`, e);
      return [];
    }
  }

  async getUserInfo(): Promise<{ username: string; avatarUrl?: string } | null> {
    try {
      const data = await this.getMe();
      return { username: data.username, avatarUrl: data.avatar_url };
    } catch (e) { return null; }
  }

  private mapTrack(item: any, likedAt?: number): Track {
    const coverUrl = item.artwork_url?.replace('large', 't500x500') || item.user?.avatar_url;
    
    return {
      id: String(item.id),
      title: item.title,
      artist: item.user?.username || 'Unknown',
      durationMs: item.duration,
      coverUrl,
      provider: this.id,
      likedAt
    };
  }
}
