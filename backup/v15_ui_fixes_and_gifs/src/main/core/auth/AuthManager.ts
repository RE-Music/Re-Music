import keytar from 'keytar';
import Store from 'electron-store';
import { BrowserWindow } from 'electron';
import { Logger } from '../error-handling/Logger';

export class AuthManager {
  private serviceName = 'NanoMus';
  private store: Store;

  constructor() {
    this.store = new Store({
      name: 'auth_config',
      encryptionKey: 'local-desktop-key'
    });
  }

  async saveToken(providerId: string, token: string): Promise<void> {
    await keytar.setPassword(this.serviceName, providerId, token);
    this.store.set(`${providerId}.hasToken`, true);
  }

  async getToken(providerId: string): Promise<string | null> {
    return await keytar.getPassword(this.serviceName, providerId);
  }

  async deleteToken(providerId: string): Promise<void> {
    await keytar.deletePassword(this.serviceName, providerId);
    this.store.delete(`${providerId}.hasToken`);
  }

  async refreshToken(providerId: string): Promise<void> {
    await this.deleteToken(providerId);
    Logger.info(`[AuthManager] Token for ${providerId} cleared (refresh placeholder)`);
  }

  async startOAuthFlow(providerId: string, config: {
    clientId: string;
    scopes: string[];
    authUrl: string;
    tokenUrl?: string;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
       const authWindow = new BrowserWindow({
         width: 800, height: 600, show: true,
         webPreferences: { nodeIntegration: false, contextIsolation: true }
       });
       
       const crypto = require('crypto');
       const codeVerifier = crypto.randomBytes(32).toString('hex');
       const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

       const scopeStr = encodeURIComponent(config.scopes.join(' '));
       const redirectUri = 'https://www.google.com/';
       const authUrl = `${config.authUrl}?client_id=${config.clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge_method=S256&code_challenge=${codeChallenge}&scope=${scopeStr}`;
       
       authWindow.loadURL(authUrl);

       authWindow.webContents.on('will-redirect', async (event, url) => {
         if (url.startsWith(redirectUri)) {
           event.preventDefault();
           
           const urlObj = new URL(url);
           const params = new URLSearchParams(urlObj.search);
           const code = params.get('code');
           
           if (code && config.tokenUrl) {
             try {
               const response = await fetch(config.tokenUrl, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                 body: new URLSearchParams({
                   client_id: config.clientId,
                   grant_type: 'authorization_code',
                   code: code,
                   redirect_uri: redirectUri,
                   code_verifier: codeVerifier
                 }).toString()
               });
               
               const data = await response.json();
               if (data.access_token) {
                 await this.saveToken(providerId, data.access_token);
                 if (data.refresh_token) {
                   await keytar.setPassword(this.serviceName, providerId + '_refresh', data.refresh_token);
                 }
                 authWindow.close();
                 resolve(data.access_token);
               } else {
                 reject(new Error('Failed to get access token: ' + JSON.stringify(data)));
               }
             } catch (e) {
               reject(e);
             }
           } else {
             reject(new Error('No auth code found in URL or tokenUrl missing'));
           }
         }
       });

       authWindow.on('closed', () => {
         reject(new Error('Auth window was closed by user'));
       });
    });
  }

  async getYandexTokenViaLoginWindow(): Promise<string | null> {
    return new Promise((resolve) => {
      const authWindow = new BrowserWindow({
        width: 800,
        height: 700,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      authWindow.webContents.setUserAgent('Mozilla/5.0 (Linux; Android 13; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36');

      const clientId = '23cabbbdc6cd418abb4b39c32c41195d'; 
      const authUrl = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${clientId}&force_confirm=yes`;

      authWindow.loadURL(authUrl);

      const handleLogin = (url: string) => {
        if (url.includes('access_token=')) {
          const hash = new URL(url).hash.substring(1);
          const params = new URLSearchParams(hash);
          const accessToken = params.get('access_token');
          if (accessToken) {
            this.saveToken('yandex', accessToken).then(() => {
              authWindow.close();
              resolve(accessToken);
            });
            return true;
          }
        }
        return false;
      };

      authWindow.webContents.on('will-navigate', (_, url) => {
        if (handleLogin(url)) {
          _.preventDefault();
        }
      });

      authWindow.webContents.on('will-redirect', (_, url) => {
        handleLogin(url);
      });

      const interval = setInterval(() => {
        if (authWindow.isDestroyed()) {
          clearInterval(interval);
          return;
        }
        handleLogin(authWindow.webContents.getURL());
      }, 1000);

      authWindow.on('closed', () => {
        clearInterval(interval);
        resolve(null);
      });
    });
  }

  async getSoundCloudTokenViaLoginWindow(): Promise<string | null> {
    return new Promise((resolve) => {
      const authWindow = new BrowserWindow({
        width: 850,
        height: 700,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: 'persist:soundcloud_auth'
        }
      });

      Logger.info('[AuthManager] Starting SoundCloud auth flow...');

      let resolved = false;
      const finish = async (token: string) => {
        if (resolved) return;
        resolved = true;
        clearInterval(interval);
        await this.saveToken('soundcloud', token);
        Logger.info('[AuthManager] SoundCloud token captured!');
        if (!authWindow.isDestroyed()) authWindow.close();
        resolve(token);
      };

      // Перехватываем реальные запросы к API чтобы получить полноправный токен.
      // oauth_token cookie — сессионный, не имеет прав на запись (PUT/DELETE).
      authWindow.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ['https://api-v2.soundcloud.com/*', 'https://api.soundcloud.com/*'] },
        (details: any, callback: (r: any) => void) => {
          const auth = details.requestHeaders['Authorization'] || details.requestHeaders['authorization'];
          if (auth && !resolved) {
            const match = auth.match(/OAuth\s+(2-\S+)/i) || auth.match(/Bearer\s+(\S+)/i);
            if (match && match[1] && match[1].startsWith('2-')) {
              Logger.info('[AuthManager] Captured write-capable OAuth token from API request!');
              
              // КРИТИЧНО: Отключаем перехватчик, чтобы избежать бесконечного цикла (утечки памяти)
              authWindow.webContents.session.webRequest.onBeforeSendHeaders(null);
              
              finish(match[1]);
            }
          }
          callback({ requestHeaders: details.requestHeaders });
        }
      );

      // Загружаем страницу входа
      authWindow.loadURL('https://soundcloud.com/signin');

      // После входа провоцируем API-запрос чтобы браузер отправил Authorization заголовок
      authWindow.webContents.on('did-navigate', async (_event: any, url: string) => {
        if (url.includes('soundcloud.com') && !url.includes('/signin') && !url.includes('/login')) {
          setTimeout(() => {
            authWindow.webContents.executeJavaScript(`
              fetch('https://api-v2.soundcloud.com/me?client_id=khI8ciOiYPX6UVGInQY5zA0zvTkfzuuC', {credentials: 'include'})
                .then(r => r.json()).catch(() => {});
            `).catch(() => {});
          }, 1500);
        }
      });

      // Резервно: берём oauth_token из cookies (ограниченные права)
      const interval = setInterval(async () => {
        if (resolved || !authWindow || authWindow.isDestroyed()) { 
          clearInterval(interval); 
          return; 
        }
        
        try {
          // Защита от race conditions: проверяем ещё раз перед обращением к webContents
          if (authWindow.isDestroyed() || !authWindow.webContents) return;
          
          const cookies = await authWindow.webContents.session.cookies.get({ domain: 'soundcloud.com' });
          const authCookie = cookies.find((c: any) => c.name === 'oauth_token');
          if (authCookie?.value) {
            Logger.info('[AuthManager] Fallback: captured oauth_token from cookie');
            await finish(authCookie.value);
          }
        } catch (e) { /* ignore */ }
      }, 2000);

      authWindow.on('closed', () => {
        clearInterval(interval);
        if (!resolved) resolve(null);
      });
    });
  }

  async getYoutubeMusicTokenViaLoginWindow(): Promise<string | null> {
    return new Promise((resolve) => {
      const { BrowserWindow } = require('electron');
      const authWindow = new BrowserWindow({
        width: 900,
        height: 700,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: 'persist:ytmusic',
        },
      });

      // Align User-Agent with the worker and proxy to ensure cookie parity
      const stealthUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
      authWindow.webContents.setUserAgent(stealthUA);

      Logger.info('[AuthManager] Starting YouTube Music auth flow...');

      let resolved = false;
      const finish = async (token: string) => {
        if (resolved) return;
        resolved = true;
        clearInterval(interval);
        await this.saveToken('youtube', token);
        Logger.info('[AuthManager] YouTube Music token captured!');
        if (!authWindow.isDestroyed()) authWindow.close();
        resolve(token);
      };

      // Poll for SAPISID cookie which indicates successful Google login
      const interval = setInterval(async () => {
        if (resolved || !authWindow || authWindow.isDestroyed()) {
          clearInterval(interval);
          return;
        }
        try {
          const cookies = await authWindow.webContents.session.cookies.get({ domain: '.youtube.com' });
          const sapisid = cookies.find((c: any) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID');
          if (sapisid?.value) {
            Logger.info('[AuthManager] YouTube Music SAPISID cookie captured!');
            await finish(sapisid.value);
          }
        } catch {}
      }, 1500);

      authWindow.loadURL(
        'https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https://music.youtube.com/'
      );

      authWindow.on('closed', () => {
        clearInterval(interval);
        if (!resolved) resolve(null);
      });
    });
  }
}

