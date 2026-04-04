const { app, BrowserWindow, ipcMain, protocol, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const { Logger } = require('./core/error-handling/Logger');
const { AuthManager } = require('./core/auth/AuthManager');
const { PluginLoader } = require('./core/plugins/PluginLoader');
const { SettingsManager } = require('./core/config/SettingsManager');
const { DiscordManager } = require('./core/discord/DiscordManager');

// Исправление SSL ошибок (net_error -101) для некоторых прокси/серверов
app.commandLine.appendSwitch('tls-min-version', 'tls1.2');
// Разрешить AudioContext без жеста пользователя (нужно для EQ через Web Audio API)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Register our custom stream protocol for CORS bypassing (keeping schemes but removing handlers)
protocol.registerSchemesAsPrivileged([
  { scheme: 'nmis-stream', privileges: { standard: true, stream: true, bypassCSP: true, secure: true, corsEnabled: true, supportFetchAPI: true } },
  { scheme: 'nmis-media', privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true } }
]);

process.env.APP_ROOT = path.join(__dirname, '..');

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: any;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'), // Vite компилирует preload как mjs
      contextIsolation: true,
      nodeIntegration: false,
      // Needed for Web Audio API (createMediaElementSource) to access cross-origin audio.
      webSecurity: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  // Robust global CORS injection for Web Audio API / Equalizer support.
  // We use a case-insensitive approach to ensure we override any server headers.
  win.webContents.session.webRequest.onHeadersReceived(
    { urls: ['*://*/*'] },
    (details: any, callback: any) => {
      const headers = details.responseHeaders || {};
      const resourceType = details.resourceType;
      const method = details.method;
      
      // Broad filter to ensure all media streams and fetches are caught
      const isMedia = resourceType === 'media' || resourceType === 'xhr' || resourceType === 'fetch' || resourceType === 'other';

      if (isMedia) {
        // Remove existing CORS headers to avoid duplicates with different casing
        Object.keys(headers).forEach(key => {
          if (key.toLowerCase().startsWith('access-control-')) {
            delete headers[key];
          }
        });

        // Inject mandatory headers for Web Audio API
        headers['Access-Control-Allow-Origin'] = ['*'];
        headers['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS, POST, PUT, DELETE'];
        headers['Access-Control-Allow-Headers'] = ['*'];
        headers['Access-Control-Expose-Headers'] = ['Content-Range, Content-Length, Accept-Ranges, Content-Type'];
        headers['Access-Control-Max-Age'] = ['86400'];
        headers['Access-Control-Allow-Credentials'] = ['true'];
        
        // Remove security headers that might block cross-origin media usage
        delete headers['Content-Security-Policy'];
        delete headers['content-security-policy'];
        delete headers['X-Frame-Options'];
        delete headers['x-frame-options'];

        // If it's a preflight request, ensure we return 200 (browser requirement)
        if (method === 'OPTIONS') {
          return callback({ responseHeaders: headers, statusLine: 'HTTP/1.1 200 OK' });
        }
      }
      callback({ responseHeaders: headers });
    }
  );
}

app.whenReady().then(() => {
  Logger.init();
  Logger.info('Application starting...');

  const authManager = new AuthManager();
  const pluginLoader = new PluginLoader(authManager);
  const settingsManager = new SettingsManager();
  
  pluginLoader.loadInternalPlugins();
  DiscordManager.connect();

  app.on('before-quit', () => {
    Logger.info('Application quitting, cleaning up...');
    DiscordManager.clear();
    pluginLoader.cleanup();
  });

  ipcMain.handle('update-discord-presence', (_: any, { track, isPlaying }: any) => {
    DiscordManager.update(track, isPlaying);
  });

  ipcMain.handle('get-settings', () => settingsManager.getAllSettings());
  
  ipcMain.handle('update-setting', (_: any, { key, value }: { key: string, value: any }) => {
    settingsManager.updateSetting(key as any, value);
    return true;
  });

  ipcMain.handle('logout-provider', async (_: any, providerId: string) => {
    await authManager.deleteToken(providerId);
    return true;
  });

  ipcMain.handle('check-auth', async () => {
    const providers = pluginLoader.getAllProviders();
    const status: Record<string, boolean> = {};
    
    const results = await Promise.allSettled(
      providers.map(async (p: any) => {
        const token = await withTimeout(authManager.getToken(p.id), 5000, p.id);
        return { id: p.id, connected: !!token };
      })
    );

    for (const res of results) {
      if (res.status === 'fulfilled') {
        status[res.value.id] = res.value.connected;
      }
    }
    return status;
  });

  ipcMain.handle('get-auth-details', async () => {
    const providers = pluginLoader.getAllProviders();
    const details: Record<string, { username: string; avatarUrl?: string } | null> = {};
    
    const results = await Promise.allSettled(
      providers.map(async (p: any) => {
        if (p.getUserInfo) {
          const info = await withTimeout(p.getUserInfo(), 10000, p.id);
          return { id: p.id, info };
        }
        return { id: p.id, info: null };
      })
    );

    for (const res of results) {
      if (res.status === 'fulfilled') {
        details[res.value.id] = res.value.info;
      } else {
        Logger.error(`[IPC] get-auth-details promise failed:`, res.reason);
      }
    }
    return details;
  });

  ipcMain.handle('get-providers', () => {
    return pluginLoader.getAllProviders().map((p: any) => ({ id: p.id, name: p.name }));
  });

  ipcMain.handle('auth-provider', async (_: any, providerId: string) => {
    const provider = pluginLoader.getProvider(providerId);
    if (provider) return await provider.auth();
    return false;
  });

  const withTimeout = (promise: Promise<any>, timeoutMs: number, providerId: string) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT_${providerId}`)), timeoutMs))
    ]);
  };

  ipcMain.handle('search', async (_: any, { providerId, query, page = 1 }: { providerId: string, query: string, page?: number }) => {
    Logger.info(`[IPC] Search request: provider=${providerId}, query=${query}, page=${page}`);
    
    if (providerId === 'all') {
      const allProviders = pluginLoader.getAllProviders();
      
      // AUTH GUARD: Only search in providers that are actually authenticated
      const authenticatedProviders = [];
      for (const p of allProviders) {
        const token = await authManager.getToken(p.id);
        if (token) {
          authenticatedProviders.push(p);
        }
      }

      const searchPromises = authenticatedProviders.map((p: any) => 
        withTimeout(p.search(query, page), 30000, p.id).catch((e: Error) => {
          Logger.error(`[IPC] Search failed or timed out for ${p.id}:`, e.message);
          return [];
        })
      );

      const results = await Promise.allSettled(searchPromises);
      
      const providerResults = results
        .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
        .map(r => r.value);
        
      // Interleave results for better mixing
      const allResults = [];
      const maxLength = Math.max(...providerResults.map(r => r.length), 0);
      
      for (let i = 0; i < maxLength; i++) {
        for (const res of providerResults) {
          if (res[i]) allResults.push(res[i]);
        }
      }
        
      Logger.info(`[IPC] Aggregated search success: ${allResults.length} results from ${authenticatedProviders.length} providers (interleaved)`);
      return allResults;
    }

    const provider = pluginLoader.getProvider(providerId);
    if (!provider) {
      Logger.warn(`[IPC] Provider not found: ${providerId}`);
      return [];
    }
    try {
      const results = await withTimeout(provider.search(query, page), 30000, providerId);
      Logger.info(`[IPC] Search success: ${results.length} results`);
      return results;
    } catch (e: any) {
      Logger.error(`[IPC] Search failed for ${providerId}:`, e.message);
      return [];
    }
  });

  ipcMain.handle('play-track', async (_: any, { providerId, trackId }: { providerId: string, trackId: string }) => {
    const provider = pluginLoader.getProvider(providerId);
    if (provider) return await provider.play(trackId);
  });

  // Spotify Web SDK specific endpoints
  ipcMain.handle('get-spotify-token', async () => {
    return await authManager.getToken('spotify');
  });

  ipcMain.handle('play-spotify-uri', async (_: any, { deviceId, trackId }: { deviceId: string, trackId: string }) => {
    const provider = pluginLoader.getProvider('spotify');
    if (provider && provider.play) {
      return await provider.play(trackId, { deviceId });
    }
  });

  ipcMain.handle('pause-spotify-track', async (_: any, { deviceId }: { deviceId: string }) => {
    const provider = pluginLoader.getProvider('spotify');
    if (provider && provider.pause) {
      return await provider.pause({ deviceId });
    }
  });

  ipcMain.handle('get-playlists', async (_: any, providerId: string) => {
    const provider = pluginLoader.getProvider(providerId);
    if (provider) {
      try {
        return await withTimeout(provider.getPlaylists(), 30000, providerId);
      } catch (e: any) {
        Logger.error(`[IPC] get-playlists failed or timed out for ${providerId}:`, e.message);
        return [];
      }
    }
    return [];
  });

  ipcMain.handle('get-playlist-tracks', async (_: any, { providerId, playlistId }: { providerId: string, playlistId: string }) => {
    const provider = pluginLoader.getProvider(providerId);
    if (provider && provider.getPlaylistTracks) {
      try {
        return await withTimeout(provider.getPlaylistTracks(playlistId), 20000, providerId);
      } catch (e: any) {
        Logger.error(`[IPC] get-playlist-tracks failed or timed out for ${providerId}:`, e.message);
        return [];
      }
    }
    return [];
  });

  ipcMain.handle('like-track', async (_: any, { providerId, trackId, like }: { providerId: string, trackId: string, like: boolean }) => {
    const provider = pluginLoader.getProvider(providerId);
    if (provider && provider.likeTrack) return await provider.likeTrack(trackId, like);
    return false;
  });

  ipcMain.handle('get-liked-tracks', async (_: any, providerId?: string) => {
    Logger.info(`[IPC] get-liked-tracks called (providerId: ${providerId})`);
    if (providerId) {
      const provider = pluginLoader.getProvider(providerId);
      if (provider && provider.getLikedTracks) {
        try {
          return await withTimeout(provider.getLikedTracks(), 30000, providerId);
        } catch (e: any) {
          Logger.error(`[IPC] get-liked-tracks failed for ${providerId}:`, e.message);
          return [];
        }
      }
      return [];
    } else {
      const providers = pluginLoader.getAllProviders();
      Logger.info(`[IPC] Fetching liked tracks from all providers in parallel...`);
      
      const results = await Promise.allSettled(
        providers.map(async (p: any) => {
          if (p.getLikedTracks) {
            return withTimeout(p.getLikedTracks(), 30000, p.id);
          }
          return [];
        })
      );

      const allTracks = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<any[]>).value)
        .flat();

      // Universal Heuristic Base: Jan 1st, 2021
      const baseHeuristicTime = new Date('2021-01-01T00:00:00Z').getTime();

      const tracksWithNormalizedDate = allTracks.map((t, index) => {
        let val = 0;
        if (typeof t.likedAt === 'number') {
          val = t.likedAt;
        } else if (typeof t.likedAt === 'string') {
          const parsed = new Date(t.likedAt).getTime();
          if (!isNaN(parsed)) val = parsed;
        }
        
        // Scale Detection (Seconds to Milliseconds)
        if (val > 0 && val < 100000000000) {
          val *= 1000;
        }
        
        const isHeuristic = val <= 0;
        const normalizedAt = isHeuristic ? (baseHeuristicTime - (index * 1000)) : val;
        
        return { 
          ...t, 
          likedAt: normalizedAt, // Update the field for the frontend
          _isHeuristic: isHeuristic 
        };
      });

      tracksWithNormalizedDate.sort((a, b) => {
        const valA = a.likedAt as number;
        const valB = b.likedAt as number;
        
        if (valB !== valA) return valB - valA;
        
        // UNBIASED INTERLEAVING
        return (a.id || '').localeCompare(b.id || '');
      });

      // ENHANCED DIAGNOSTICS
      const breakdown: Record<string, { total: number, hasDate: number, heuristic: number }> = {};
      tracksWithNormalizedDate.forEach(t => {
        if (!breakdown[t.provider]) breakdown[t.provider] = { total: 0, hasDate: 0, heuristic: 0 };
        breakdown[t.provider].total++;
        if (t._isHeuristic) breakdown[t.provider].heuristic++;
        else breakdown[t.provider].hasDate++;
      });

      Logger.info(`[IPC] SORT QUALITY REPORT: ${JSON.stringify(breakdown, null, 2)}`);
      if (tracksWithNormalizedDate.length > 0) {
        Logger.info(`[IPC] --- TOP 10 SORTED TRACKS ---`);
        tracksWithNormalizedDate.slice(0, 10).forEach((t, i) => {
          Logger.info(`[IPC] #${i+1} [${t.provider}] ${t.title} | LikedAt: ${new Date(t.likedAt as number).toLocaleString()} (Heuristic: ${t._isHeuristic})`);
        });
        Logger.info(`[IPC] ---------------------------`);
      }

      return tracksWithNormalizedDate;
    }
  });

  // Equalizer Persistence
  ipcMain.handle('get-eq-state', () => {
    return settingsManager.getAllSettings().eqState;
  });

  ipcMain.handle('save-eq-state', (_: any, state: any) => {
    settingsManager.updateSetting('eqState', state);
    return true;
  });

  ipcMain.handle('create-playlist', async (_: any, { providerId, title }: { providerId: string, title: string }) => {
    const provider = pluginLoader.getProvider(providerId);
    if (provider && provider.createPlaylist) return await provider.createPlaylist(title);
    return false;
  });

  ipcMain.handle('add-track-to-playlist', async (_: any, { providerId, playlistId, trackId }: { providerId: string, playlistId: string, trackId: string }) => {
    const provider = pluginLoader.getProvider(providerId);
    if (provider && provider.addTrackToPlaylist) return await provider.addTrackToPlaylist(playlistId, trackId);
    return false;
  });

  ipcMain.handle('get-my-wave', async (_: any, providerIds?: string[]) => {
    Logger.info(`[IPC] get-my-wave request (providers: ${providerIds?.join(',') || 'all'})`);
    let providers = pluginLoader.getAllProviders();
    
    // Filter providers if requested, otherwise check auth
    if (providerIds && providerIds.length > 0) {
      providers = providers.filter((p: any) => providerIds.includes(p.id));
    }
    
    const results = await Promise.allSettled(
      providers.map(async (p: any) => {
        if (p.getRecommendations) {
          try {
            return await withTimeout(p.getRecommendations(), 15000, p.id);
          } catch (e) {
            Logger.error(`[IPC] getRecommendations failed for ${p.id}`, e);
            return [];
          }
        }
        return [];
      })
    );

    const allRecommendations = results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any[]>).value)
      .flat();

    for (let i = allRecommendations.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allRecommendations[i], allRecommendations[j]] = [allRecommendations[j], allRecommendations[i]];
    }

    const seen = new Set();
    const unique = allRecommendations.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    const mixed = unique.slice(0, 100);

    Logger.info(`[IPC] get-my-wave shuffled success: ${mixed.length} tracks`);
    return mixed;
  });

  ipcMain.handle('get-track-radio', async (_: any, { providerId, trackId }: { providerId: string, trackId: string }) => {
    Logger.info(`[IPC] get-track-radio request: provider=${providerId}, trackId=${trackId}`);
    const provider = pluginLoader.getProvider(providerId);
    if (provider && provider.getRecommendations) {
      try {
        const tracks = await withTimeout(provider.getRecommendations(trackId), 20000, providerId);
        
        for (let i = tracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
        }
        
        return tracks.slice(0, 100);
      } catch (e: any) {
        Logger.error(`[IPC] get-track-radio failed for ${providerId}:`, e.message);
        return [];
      }
    }
    return [];
  });

  // Local Playlists
  ipcMain.handle('get-local-playlists', () => {
    return settingsManager.getAllSettings().localPlaylists || [];
  });

  ipcMain.handle('save-local-playlist', (_: any, { playlist }: { playlist: any }) => {
    const settings = settingsManager.getAllSettings();
    const playlists = settings.localPlaylists || [];
    const index = playlists.findIndex((p: any) => p.id === playlist.id);
    
    if (index !== -1) {
      playlists[index] = playlist;
    } else {
      playlists.push(playlist);
    }
    
    settingsManager.updateSetting('localPlaylists', playlists);
    return true;
  });

  ipcMain.handle('add-to-local-playlist', (_: any, { playlistId, track }: { playlistId: string, track: any }) => {
    const settings = settingsManager.getAllSettings();
    const playlists = settings.localPlaylists || [];
    const index = playlists.findIndex((p: any) => p.id === playlistId);
    
    if (index !== -1) {
      if (!playlists[index].tracks) playlists[index].tracks = [];
      // Avoid duplicates
      if (!playlists[index].tracks.find((t: any) => t.id === track.id)) {
        playlists[index].tracks.push(track);
        settingsManager.updateSetting('localPlaylists', playlists);
      }
      return true;
    }
    return false;
  });

  ipcMain.handle('delete-local-playlist', (_: any, { id }: { id: string }) => {
    const settings = settingsManager.getAllSettings();
    const playlists = settings.localPlaylists || [];
    const filtered = playlists.filter((p: any) => p.id !== id);
    settingsManager.updateSetting('localPlaylists', filtered);
    return true;
  });

  // Profile Avatar
  ipcMain.handle('select-avatar-file', async () => {
    Logger.info('[IPC] select-avatar-file requested');
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }]
    });

    if (canceled || filePaths.length === 0) {
      Logger.info('[IPC] select-avatar-file canceled');
      return null;
    }

    try {
      Logger.info(`[IPC] Processing avatar file: ${filePaths[0]}`);
      const buffer = fs.readFileSync(filePaths[0]);
      const base64 = buffer.toString('base64');
      const ext = path.extname(filePaths[0]).replace('.', '');
      const dataUrl = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${base64}`;
      
      settingsManager.updateSetting('avatarUrl', dataUrl);
      Logger.info('[IPC] select-avatar-file success');
      return dataUrl;
    } catch (e) {
      Logger.error('[IPC] Failed to process avatar image:', e);
      return null;
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
