import type { IMusicProvider, Track, Playlist } from '../../../shared/interfaces/IMusicProvider';
import { AuthManager } from '../../core/auth/AuthManager';
import { Logger } from '../../core/error-handling/Logger';

const YTM_BASE = 'https://music.youtube.com';
const INNERTUBE_URL = `${YTM_BASE}/youtubei/v1`;

const WEB_CLIENT_CTX = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20250313.01.00',
    hl: 'en',
    gl: 'US',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  },
};

const TV_CLIENT_CTX = {
  client: {
    clientName: 'TVHTML5',
    clientVersion: '7.20230404.09.00',
    osName: 'Windows',
    osVersion: '10.0',
    platform: 'DESKTOP',
    hl: 'en',
    gl: 'US'
  }
};
const IOS_CLIENT_CTX = {
  client: {
    clientName: 'IOS',
    clientVersion: '19.45.4',
    deviceMake: 'Apple',
    deviceModel: 'iPhone16,2',
    osName: 'iOS',
    osVersion: '18.1.0.22B83',
    hl: 'en',
    gl: 'US'
  }
};
const ANDROID_MUSIC_CLIENT_CTX = {
  client: {
    clientName: 'ANDROID_MUSIC',
    clientVersion: '7.27.52',
    osName: 'Android',
    osVersion: '11',
    platform: 'MOBILE',
    hl: 'en',
    gl: 'US',
  }
};

export class YouTubeMusicProvider implements IMusicProvider {
  public readonly id = 'youtube';
  public readonly name = 'YouTube Music';

  private static workerWindow: import('electron').BrowserWindow | null = null;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(private authManager: AuthManager) {}

  async auth(): Promise<boolean> {
    try {
      const token = await this.authManager.getYoutubeMusicTokenViaLoginWindow();
      if (token) {
        if (YouTubeMusicProvider.workerWindow && !YouTubeMusicProvider.workerWindow.isDestroyed()) {
          if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
          }
          YouTubeMusicProvider.workerWindow.destroy();
          YouTubeMusicProvider.workerWindow = null;
        }
        return true;
      }
      return false;
    } catch (e) {
      Logger.error('[YouTubeMusicProvider] Auth failed', e);
      return false;
    }
  }

  private async isAuthenticated(): Promise<boolean> {
    const token = await this.authManager.getToken(this.id);
    return !!token;
  }

  private async getWorkerWindow(): Promise<import('electron').BrowserWindow> {
    const { BrowserWindow } = require('electron');
    if (YouTubeMusicProvider.workerWindow && !YouTubeMusicProvider.workerWindow.isDestroyed()) {
      return YouTubeMusicProvider.workerWindow;
    }

    const win = new BrowserWindow({
      width: 1280, height: 800, 
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:ytmusic',
        webSecurity: false,
      },
    }) as import('electron').BrowserWindow;

    // Use a strict stealth UA to avoid bot detection
    const stealthUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
    win.webContents.setUserAgent(stealthUA);

    // Mute to prevent independent playback sound
    win.webContents.setAudioMuted(true);

    YouTubeMusicProvider.workerWindow = win;

    win.loadURL(YTM_BASE);

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 15000); 
      const checkReady = async () => {
        try {
          const isReady = await win.webContents.executeJavaScript('typeof ytcfg !== "undefined" && !!ytcfg.get("INNERTUBE_CONTEXT")');
          if (isReady) {
            Logger.info('[YouTubeMusicProvider] Worker bootstrap: ytcfg ready, warming up session...');
            // Navigate to a short teaser video to "warm up" the player and security tokens
            await win.webContents.executeJavaScript('window.location.href = "https://music.youtube.com/watch?v=0"'); 
            clearTimeout(timer);
            setTimeout(resolve, 3000); // 3s for warm-up initiation
          } else {
            setTimeout(checkReady, 800);
          }
        } catch(e) { setTimeout(checkReady, 800); }
      };
      win.webContents.once('did-finish-load', checkReady);
      win.webContents.once('did-fail-load', () => { clearTimeout(timer); resolve(); });
    });

    return win;
  }

  public static cleanup() {
    if (YouTubeMusicProvider.workerWindow && !YouTubeMusicProvider.workerWindow.isDestroyed()) {
      // Proactively stop any media before destroying
      YouTubeMusicProvider.workerWindow.webContents.executeJavaScript('try { const a = document.querySelector("video, audio"); if(a) { a.pause(); a.src = ""; } } catch(e) {}').finally(() => {
        YouTubeMusicProvider.workerWindow?.destroy();
        YouTubeMusicProvider.workerWindow = null;
      });
    }
  }

  /** Makes an InnerTube API request via the worker window's session (includes cookies). */
  private async callApi(endpoint: string, body: Record<string, any> = {}, customClient: 'WEB' | 'IOS' | 'WEB_REMIX' | 'TVHTML5' | 'ANDROID_MUSIC' = 'WEB_REMIX'): Promise<any> {
    const worker = await this.getWorkerWindow();
    const url = `${INNERTUBE_URL}/${endpoint}`;
    
    let ctx: any = { ...WEB_CLIENT_CTX };
    let clientName = '67'; 
    let clientVersion = '1.20250313.01.00';
    let userAgent = WEB_CLIENT_CTX.client.userAgent;
    let credentials = 'include';
    let extraHeaders: Record<string, string> = {
      'X-Origin': 'https://music.youtube.com',
      'Origin': 'https://music.youtube.com',
      'Referer': 'https://music.youtube.com/',
    };
    
    // Attempt to grab dynamic STS, context, UA, and security headers from the site
    try {
      const siteConfig = await worker.webContents.executeJavaScript(`
        (() => {
          try {
            const getSts = () => {
              const sts = typeof ytcfg !== 'undefined' && ytcfg.get ? ytcfg.get('STS') : null;
              if (sts) return sts;
              const player = document.querySelector('ytmusic-app-player');
              if (player && player.playerApi && player.playerApi.getSts) return player.playerApi.getSts();
              return null;
            };
            return {
              sts: getSts(),
              ctx: typeof ytcfg !== 'undefined' && ytcfg.get ? ytcfg.get('INNERTUBE_CONTEXT') : null,
              ua: navigator.userAgent,
              visitorId: typeof ytcfg !== 'undefined' && ytcfg.get ? ytcfg.get('VISITOR_DATA') : null,
              identityToken: typeof ytcfg !== 'undefined' && ytcfg.get ? ytcfg.get('ID_TOKEN') : null,
              pot: typeof ytcfg !== 'undefined' && ytcfg.get ? ytcfg.get('PO_TOKEN') : null,
              clientVersion: typeof ytcfg !== 'undefined' && ytcfg.get ? ytcfg.get('CLIENT_VERSION') : null
            };
          } catch(e) { return null; }
        })()
      `);
      if (siteConfig?.ctx) {
        ctx = siteConfig.ctx;
      }
      if (siteConfig?.clientVersion) {
        clientVersion = siteConfig.clientVersion;
        Logger.info(`[YouTubeMusicProvider] Environment Sync: Pulled live CLIENT_VERSION ${clientVersion}`);
      }
      if (siteConfig?.ua) {
        userAgent = siteConfig.ua;
      }
      if (siteConfig?.visitorId) extraHeaders['X-Goog-Visitor-Id'] = siteConfig.visitorId;
      if (siteConfig?.identityToken) extraHeaders['X-Youtube-Identity-Token'] = siteConfig.identityToken;
      
      if (siteConfig?.sts) {
        if (!body.playbackContext) body.playbackContext = { contentPlaybackContext: {} };
        body.playbackContext.contentPlaybackContext.signatureTimestamp = siteConfig.sts;
      } else {
        if (!body.playbackContext) body.playbackContext = { contentPlaybackContext: {} };
        body.playbackContext.contentPlaybackContext.signatureTimestamp = 19876; 
      }
      
      // Inject PO-Token if found
      if (siteConfig?.pot && endpoint === 'player') {
        if (!body.serviceIntegrityDimensions) body.serviceIntegrityDimensions = {};
        body.serviceIntegrityDimensions.poToken = siteConfig.pot;
      }
    } catch (e) {}

    if (customClient === 'IOS') {
      ctx = IOS_CLIENT_CTX;
      clientName = '5'; // IOS 
      clientVersion = '19.45.4';
      userAgent = 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X; en_US)';
      credentials = 'omit';
    } else if (customClient === 'TVHTML5') {
      ctx = TV_CLIENT_CTX;
      clientName = '85'; // TVHTML5
      clientVersion = '7.20230404.09.00';
      userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
      credentials = 'omit'; 
    } else if (customClient === 'ANDROID_MUSIC') {
      ctx = ANDROID_MUSIC_CLIENT_CTX;
      clientName = '21'; // ANDROID_MUSIC
      clientVersion = '7.27.52';
      userAgent = 'com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 11; en_US; Pixel 4 XL; Build/RP1A.200720.009; Cronet/84.0.4147.105)';
      credentials = 'omit';
    } else {
      clientName = '67';
      credentials = 'include';
    }
    
    const payloadObj = { ...body, context: ctx };

    const result = await worker.webContents.executeJavaScript(`
      (async () => {
        try {
          const res = await fetch(${JSON.stringify(url)}, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-YouTube-Client-Name': ${JSON.stringify(clientName)},
              'X-YouTube-Client-Version': ${JSON.stringify(clientVersion)},
              'User-Agent': ${JSON.stringify(userAgent)},
              ...${JSON.stringify(extraHeaders)}
            },
            credentials: ${JSON.stringify(credentials)},
            body: JSON.stringify(${JSON.stringify(payloadObj)}),
          });
          if (!res.ok) return { __ytm_error: res.status };
          return await res.json();
        } catch (e) {
          return { __ytm_error: e.message };
        }
      })()
    `);

    if (result?.__ytm_error) {
      if (typeof result.__ytm_error === 'number' && (result.__ytm_error === 400 || result.__ytm_error === 403)) {
        Logger.warn(`[YouTubeMusicProvider] Bot detection suspected (${result.__ytm_error}). Proactively clearing worker cache...`);
        worker.webContents.session.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }).catch(() => {});
      }
      // Don't throw on player endpoint, just return a fake error response so fallback can trigger
      if (endpoint === 'player') return { playabilityStatus: { status: 'ERROR', reason: result.__ytm_error } };
      throw new Error(`[YouTubeMusic] API error on ${endpoint}: ${result.__ytm_error}`);
    }
    return result;
  }

  /**
   * Final fallback: Navigates the worker window directly to the YouTube video page 
   * and extracts the ytInitialPlayerResponse payload from the page source.
   * This naturally evaluates bot protections and decrypts streams via the Chrome engine.
   */
  /**
   * Final fallback: Uses Chrome DevTools Protocol (CDP) to intercept the actual JSON 
   * response of the /player API call made by the official YouTube Music web client.
   * This completely avoids manual PO-Token generation and extracts the native streaming payloads.
   */
  private async extractPlayerResponseViaCDP(videoId: string): Promise<any> {
    const worker = await this.getWorkerWindow();
    Logger.info(`[YouTubeMusicProvider] Attaching CDP to extract /player payload for ${videoId}`);
    
    return new Promise<any>(async (resolve) => {
      let resolved = false;
      let wcDebugger: any = null;

      const cleanup = () => {
        if (wcDebugger) {
          try { wcDebugger.detach(); } catch (e) {}
        }
        worker.loadURL(YTM_BASE);
      };

      const finishInfo = (data: any) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(data);
        }
      };

      try {
        wcDebugger = worker.webContents.debugger;
        if (!wcDebugger.isAttached()) {
            wcDebugger.attach('1.3');
        }
        await wcDebugger.sendCommand('Network.enable');

        wcDebugger.on('message', async (_event: any, method: string, params: any) => {
          if (resolved) return;

          if (method === 'Network.responseReceived') {
            const url = params.response.url;
            if (url.includes('/youtubei/v1/player')) {
              const status = params.response.status;
              if (status !== 200) {
                Logger.warn(`[YouTubeMusicProvider] Intercepted /player with status ${status}`);
                if (status === 403 || status === 429) {
                  Logger.warn('[YouTubeMusicProvider] CDP blocked. Resetting worker session...');
                  worker.webContents.session.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }).catch(() => {});
                }
                return;
              }

              try {
                const response = await wcDebugger.sendCommand('Network.getResponseBody', {
                  requestId: params.requestId
                });
                const body = JSON.parse(response.body);
                if (body && body.streamingData) {
                  const formats = body.streamingData.adaptiveFormats || [];
                  const hasUrls = formats.some((f: any) => f.url);
                  const hasCiphers = formats.some((f: any) => f.signatureCipher || f.cipher);
                  
                  Logger.info(`[YouTubeMusicProvider] CDP Extracted: ${formats.length} formats (URLs: ${hasUrls}, Ciphers: ${hasCiphers})`);
                  
                  if (hasUrls) {
                    finishInfo(body.streamingData);
                  } else if (hasCiphers) {
                    Logger.warn('[YouTubeMusicProvider] Intercepted formats only contain signatureCipher - decryption required');
                    // We might need to handle decryption later if this becomes the only option
                  }
                }
              } catch (e) {
                Logger.error('[YouTubeMusicProvider] Failed to parse CDP response body', e);
              }
            }
          }
        });

        // Timeout fallback - Poll for decrypted data
        setTimeout(async () => {
          if (!resolved) {
            Logger.info('[YouTubeMusicProvider] CDP interception timed out. Polling for decrypted JS extraction...');
            try {
              const decryptedData = await worker.webContents.executeJavaScript(`
                (async () => {
                  for (let i = 0; i < 35; i++) { // ~21s total polling
                    try {
                      const player = document.querySelector('ytmusic-app-player');
                      let streamingData = null;
                      
                      // Try official player API first
                      if (player && player.playerApi && typeof player.playerApi.getPlayerResponse === 'function') {
                        const resp = player.playerApi.getPlayerResponse();
                        streamingData = resp?.streamingData;
                        
                        // Check if it's already decrypted
                        if (streamingData?.adaptiveFormats?.some((f: any) => f.url)) {
                          return streamingData;
                        }
                      } 
                      
                      // Fallback to global data
                      streamingData = window.ytInitialPlayerResponse ? window.ytInitialPlayerResponse.streamingData : null;
                      if (streamingData && streamingData.adaptiveFormats && streamingData.adaptiveFormats.some(f => f.url)) {
                        return streamingData;
                      }

                      // If we are stuck or idle, aggressively trigger play to force decryption
                      if (player && player.playerApi) {
                        const state = player.playerApi.getPlayerState();
                        if (state !== 1) { // 1 = PLAYING
                          player.playerApi.playVideo();
                        }
                      }

                      if (i === 10 || i === 20 || i === 30) {
                        const playBtn = document.querySelector('.play-button, ytmusic-play-button-renderer');
                        if (playBtn) playBtn.click();
                      }
                    } catch (e) {}
                    await new Promise(r => setTimeout(r, 600));
                  }
                  return null;
                })()
              `);
              
              if (decryptedData && decryptedData.adaptiveFormats) {
                Logger.info(`[YouTubeMusicProvider] Successfully extracted decrypted streamingData via JS polling v2 (found URLs: ${decryptedData.adaptiveFormats.some((f: any) => f.url)})`);
                finishInfo(decryptedData);
              } else {
                Logger.warn('[YouTubeMusicProvider] JS polling v2 finished with no valid streamingData');
                finishInfo(null);
              }
            } catch (e) {
              finishInfo(null);
            }
          }
        }, 8000); // Shorter initial timeout to start polling sooner

        // Native Mirroring: Use the official player internal API to load and decrypt
        await worker.webContents.executeJavaScript(`
          (async () => {
             const player = document.querySelector('ytmusic-app-player');
             if (player && player.playerApi && typeof player.playerApi.loadVideoById === 'function') {
               player.playerApi.loadVideoById('${videoId}');
               player.playerApi.playVideo();
             } else {
               window.location.href = 'https://music.youtube.com/watch?v=${videoId}';
             }
          })()
        `);

      } catch (e: any) {
        Logger.error('[YouTubeMusicProvider] CDP/SPA navigation error:', e.message);
        finishInfo(null);
      }
    });
  }

  // ─── Play ──────────────────────────────────────────────────────────────────

  async play(trackId: string): Promise<string> {
    const videoId = trackId.replace('youtube:', '');
    
    // Attempt playback using WEB_REMIX client (synced with browser session)
    let data = await this.callApi('player', {
      videoId,
      racyCheckOk: true,
      contentCheckOk: true,
    }, 'WEB_REMIX');

    let streamingData = data?.streamingData;

    // Fallback 1: ANDROID_MUSIC client (higher extraction success)
    if (!streamingData || data?.playabilityStatus?.status !== 'OK') {
      Logger.info(`[YouTubeMusicProvider] WEB_REMIX playback status: ${data?.playabilityStatus?.status || 'FAILED'}, trying ANDROID_MUSIC...`);
      data = await this.callApi('player', {
        videoId,
        racyCheckOk: true,
        contentCheckOk: true,
      }, 'ANDROID_MUSIC');
      streamingData = data?.streamingData;
    }

    // Fallback 2: CDP / Worker injection
    if (!streamingData || data?.playabilityStatus?.status !== 'OK') {
      Logger.info(`[YouTubeMusicProvider] Direct extraction failed (${data?.playabilityStatus?.status || 'UNKNOWN'}), falling back to CDP...`);
      streamingData = await this.extractPlayerResponseViaCDP(videoId);
    }

    // Attempt to extract from streamingData if we got any
    if (streamingData) {
      const formats: any[] = streamingData?.adaptiveFormats || [];
      // Prefer OPUS (itag 251, ~160kbps) then AAC (itag 140, ~128kbps)
      const audio =
        formats.find((f) => f.itag === 251 && f.url) ||
        formats.find((f) => f.itag === 140 && f.url) ||
        formats.find((f) => f.mimeType?.startsWith('audio/') && f.url);

      if (audio?.url) {
        Logger.info(`[YouTubeMusicProvider] Playing ${videoId} via itag ${audio.itag}`);
        return `nmis-stream://youtube?url=${encodeURIComponent(audio.url)}`;
      }
    }

    // Final fallback: Intercept the native decrypted stream payload triggered by playing in Chromium
    Logger.info('[YouTubeMusicProvider] Direct streamingData extraction failed, utilizing native CDP interception fallback...');
    if (!streamingData) {
      streamingData = await this.extractPlayerResponseViaCDP(videoId);
    }
    
    if (streamingData) {
      const formats: any[] = streamingData?.adaptiveFormats || [];
      // Prefer OPUS (itag 251) without DRM
      const audio =
        formats.find((f) => f.itag === 251 && f.url) ||
        formats.find((f) => f.itag === 140 && f.url) ||
        formats.find((f) => f.mimeType?.startsWith('audio/') && f.url);

      if (audio?.url) {
        Logger.info(`[YouTubeMusicProvider] Playing ${videoId} via CDP-extracted itag ${audio.itag}`);
        return `nmis-stream://youtube?url=${encodeURIComponent(audio.url)}`;
      }
    }

    Logger.error('[YouTubeMusicProvider] No streamable audio format', JSON.stringify(data?.playabilityStatus));
    throw new Error('No streamable audio format found');
  }

  async pause(): Promise<void> {}

  // ─── Search ────────────────────────────────────────────────────────────────

  async search(query: string): Promise<Track[]> {
    const data = await this.callApi('search', {
      query,
      params: 'EgWKAQIIAWoKEAMQBBAJEAoQBQ==', // songs filter
    });
    return this.parseShelfItems(data).map(this.mapTrack).filter(Boolean) as Track[];
  }

  // ─── Liked & Playlists ─────────────────────────────────────────────────────

  async getLikedTracks(): Promise<Track[]> {
    if (!await this.isAuthenticated()) return [];
    try {
      const data = await this.callApi('browse', { browseId: 'FEmusic_liked_songs' });
      return this.parseBrowseItems(data).map(this.mapTrack).filter(Boolean) as Track[];
    } catch (e) { Logger.error('[YouTubeMusicProvider] getLikedTracks failed', e); return []; }
  }

  async getPlaylists(): Promise<Playlist[]> {
    if (!await this.isAuthenticated()) return [];
    try {
      const data = await this.callApi('browse', { browseId: 'FEmusic_library_landing' });
      return this.parsePlaylists(data);
    } catch (e) { Logger.error('[YouTubeMusicProvider] getPlaylists failed', e); return []; }
  }

  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    if (!await this.isAuthenticated()) return [];
    try {
      const browseId = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;
      const data = await this.callApi('browse', { browseId });
      return this.parseBrowseItems(data).map(this.mapTrack).filter(Boolean) as Track[];
    } catch (e) { Logger.error('[YouTubeMusicProvider] getPlaylistTracks failed', e); return []; }
  }

  // ─── Like ──────────────────────────────────────────────────────────────────

  async likeTrack(trackId: string, like: boolean): Promise<boolean> {
    try {
      const videoId = trackId.replace('youtube:', '');
      await this.callApi(like ? 'like/like' : 'like/removelike', {
        target: { videoId },
      });
      return true;
    } catch (e) {
      Logger.error('[YouTubeMusicProvider] likeTrack failed', e);
      return false;
    }
  }

  // ─── Recommendations ───────────────────────────────────────────────────────

  async getRecommendations(seedTrackId?: string): Promise<Track[]> {
    try {
      if (seedTrackId) {
        const videoId = seedTrackId.replace('youtube:', '');
        const data = await this.callApi('next', {
          videoId,
          isAudioOnly: true,
          params: 'wAEB8gECeAE=',
        });
        const items = this.parseNextItems(data);
        if (items.length > 0) return items;
      }
      // Fallback: home feed
      const data = await this.callApi('browse', { browseId: 'FEmusic_home' });
      return this.parseBrowseItems(data).slice(0, 20).map(this.mapTrack).filter(Boolean) as Track[];
    } catch (e) {
      Logger.error('[YouTubeMusicProvider] getRecommendations failed', e);
      return [];
    }
  }

  async getUserInfo(): Promise<{ username: string; avatarUrl?: string } | null> {
    try {
      const data = await this.callApi('account/account_menu');
      const name =
        data?.actions?.[0]?.openPopupAction?.popup?.multiPageMenuRenderer?.header
          ?.activeAccountHeaderRenderer?.accountName?.runs?.[0]?.text;
      const avatar =
        data?.actions?.[0]?.openPopupAction?.popup?.multiPageMenuRenderer?.header
          ?.activeAccountHeaderRenderer?.accountPhoto?.thumbnails?.[0]?.url;
      return { username: name || 'YouTube Music', avatarUrl: avatar };
    } catch {
      return { username: 'YouTube Music' };
    }
  }

  // ─── Parsers ───────────────────────────────────────────────────────────────

  /** Parse search result shelf items. */
  private parseShelfItems(data: any): any[] {
    const items: any[] = [];
    try {
      const tabs =
        data?.contents?.tabbedSearchResultsRenderer?.tabs ||
        data?.contents?.sectionListRenderer?.contents ||
        [];
      const traverse = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (node.musicResponsiveListItemRenderer) {
          items.push(node);
          return;
        }
        for (const key of Object.keys(node)) {
          if (Array.isArray(node[key])) node[key].forEach(traverse);
          else if (typeof node[key] === 'object') traverse(node[key]);
        }
      };
      tabs.forEach(traverse);
    } catch {}
    return items;
  }

  /** Parse browse (liked songs, playlist tracks) items. */
  private parseBrowseItems(data: any): any[] {
    const items: any[] = [];
    try {
      const recurse = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (node.musicResponsiveListItemRenderer) { items.push(node); return; }
        for (const val of Object.values(node)) {
          if (Array.isArray(val)) val.forEach(recurse);
          else if (val && typeof val === 'object') recurse(val);
        }
      };
      const root = data?.contents || data?.continuationContents;
      recurse(root);
    } catch {}
    return items;
  }

  /** Parse 'next' endpoint autoplay queue. */
  private parseNextItems(data: any): Track[] {
    const tracks: Track[] = [];
    try {
      const queue = data?.contents?.singleColumnMusicWatchNextResultsRenderer
        ?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]
        ?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents || [];
      for (const item of queue) {
        const r = item?.playlistPanelVideoRenderer;
        if (!r?.videoId) continue;
        const title = r?.title?.runs?.[0]?.text || 'Unknown';
        const artist = r?.shortBylineText?.runs?.[0]?.text || 'Unknown Artist';
        const thumbnails = r?.thumbnail?.thumbnails || [];
        const coverUrl = thumbnails[thumbnails.length - 1]?.url;
        const durationText = r?.lengthText?.runs?.[0]?.text || '0:00';
        const [m, s] = durationText.split(':').map(Number);
        tracks.push({
          id: `youtube:${r.videoId}`,
          title, artist,
          durationMs: ((m || 0) * 60 + (s || 0)) * 1000,
          coverUrl,
          provider: 'youtube',
        });
      }
    } catch {}
    return tracks;
  }

  /** Parse playlists from library browse response. */
  private parsePlaylists(data: any): Playlist[] {
    const playlists: Playlist[] = [];
    try {
      const recurse = (node: any) => {
        if (!node || typeof node !== 'object') return;
        const r = node.musicTwoRowItemRenderer || node.musicResponsiveListItemRenderer;
        if (r) {
          const title = r?.title?.runs?.[0]?.text || r?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
          const browseId = r?.navigationEndpoint?.browseEndpoint?.browseId ||
            r?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchPlaylistEndpoint?.playlistId;
          const thumbnails = r?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
            r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          const coverUrl = thumbnails[thumbnails.length - 1]?.url;
          if (title && browseId && browseId.startsWith('VL')) {
            playlists.push({ id: browseId.replace('VL', ''), title, coverUrl, trackCount: 0 });
          }
          return;
        }
        for (const val of Object.values(node)) {
          if (Array.isArray(val)) val.forEach(recurse);
          else if (val && typeof val === 'object') recurse(val);
        }
      };
      recurse(data?.contents);
    } catch {}
    return playlists;
  }

  /** Map a musicResponsiveListItemRenderer node to a Track. */
  private mapTrack = (item: any): Track | null => {
    try {
      const r = item?.musicResponsiveListItemRenderer;
      if (!r) return null;

      // Video ID — multiple possible locations
      const videoId =
        r?.playlistItemData?.videoId ||
        r?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
          ?.playNavigationEndpoint?.watchEndpoint?.videoId ||
        r?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text
          ?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

      if (!videoId) return null;

      const title = r?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Unknown';

      // Artist: second flex column, filter out · separators
      const artistRuns: any[] =
        r?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const artist = artistRuns.map((rn: any) => rn.text).join('').replace(/\s*·\s*/g, ', ').trim() || 'Unknown Artist';

      // Duration: search across fixed and flex columns for a "0:00" pattern
      let durText = '0:00';
      const allRuns = [
        ...(r?.fixedColumns || []).flatMap((c: any) => c?.musicResponsiveListItemFixedColumnRenderer?.text?.runs || []),
        ...(r?.flexColumns || []).flatMap((c: any) => c?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [])
      ];
      const durRun = allRuns.find((rn: any) => /^\d+:\d+(:\d+)?$/.test(rn?.text || ''));
      if (durRun) durText = durRun.text;

      const parts = durText.split(':').map(Number);
      let durationMs = 0;
      if (parts.length === 2) durationMs = (parts[0] * 60 + parts[1]) * 1000;
      else if (parts.length === 3) durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;

      // Cover art
      const thumbnails: any[] = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      const coverUrl = thumbnails[thumbnails.length - 1]?.url;

      return { id: `youtube:${videoId}`, title, artist, durationMs, coverUrl, provider: 'youtube' };
    } catch {
      return null;
    }
  };
}
