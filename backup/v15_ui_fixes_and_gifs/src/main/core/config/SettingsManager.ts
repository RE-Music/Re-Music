import Store from 'electron-store';
import { ProxyManager } from '../network/ProxyManager';
import { Logger } from '../error-handling/Logger';

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  language: string;
  proxyEnabled: boolean;
  proxyUrl: string;
  volume: number;
  eqState?: {
    gains: number[];
    presets: any[];
    activePreset: string;
    isEnabled: boolean;
  };
}

export class SettingsManager {
  private store: Store<AppSettings>;
  private defaultSettings: AppSettings = {
    theme: 'dark',
    language: 'ru',
    proxyEnabled: false,
    proxyUrl: '',
    volume: 1.0,
    eqState: {
      gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      presets: [],
      activePreset: 'Flat',
      isEnabled: false
    }
  };

  constructor() {
    this.store = new Store<AppSettings>({
      name: 'app_settings',
      defaults: this.defaultSettings
    });

    this.applyInitialSettings();
  }

  private applyInitialSettings() {
    const settings = this.getAllSettings();
    if (settings.proxyEnabled && settings.proxyUrl) {
      Logger.info(`[SettingsManager] Applying initial proxy: ${settings.proxyUrl}`);
      ProxyManager.setProxy(settings.proxyUrl);
    }
  }

  public getAllSettings(): AppSettings {
    return this.store.store;
  }

  public updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    this.store.set(key, value);
    Logger.info(`[SettingsManager] Setting updated: ${key} = ${value}`);

    // Специальная обработка для прокси
    if (key === 'proxyEnabled' || key === 'proxyUrl') {
      const settings = this.getAllSettings();
      if (settings.proxyEnabled && settings.proxyUrl) {
        ProxyManager.setProxy(settings.proxyUrl);
      } else {
        ProxyManager.clearProxy();
      }
    }
  }
}
