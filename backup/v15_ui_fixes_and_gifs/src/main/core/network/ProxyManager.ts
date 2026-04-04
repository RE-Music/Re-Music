import { session } from 'electron';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Logger } from '../error-handling/Logger';

export class ProxyManager {
  private static agent: HttpsProxyAgent<string> | null = null;

  public static setProxy(url: string) {
    try {
      this.agent = new HttpsProxyAgent(url);
      
      // Применяем прокси к дефолтной сессии и сессии SoundCloud
      const sessions = [
        session.defaultSession,
        session.fromPartition('persist:soundcloud_auth')
      ];

      for (const s of sessions) {
        if (s) {
          s.setProxy({ proxyRules: url }).then(() => {
            Logger.info(`[ProxyManager] Session (${s.getStoragePath()}) proxy set to: ${url}`);
          }).catch(err => {
            Logger.error(`[ProxyManager] Failed to set proxy for session: ${err.message}`);
          });
        }
      }
      
      Logger.info(`[ProxyManager] Proxy agent initialized: ${url}`);
    } catch (error) {
      Logger.error(`[ProxyManager] Failed to set proxy: ${url}`, error);
    }
  }

  public static clearProxy() {
    this.agent = null;
    
    if (session.defaultSession) {
      session.defaultSession.setProxy({ proxyRules: 'direct://' }).then(() => {
        Logger.info(`[ProxyManager] Electron Session proxy cleared.`);
      });
    }
  }

  public static getAgent() {
    return this.agent;
  }
}
