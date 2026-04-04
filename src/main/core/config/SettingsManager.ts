import Store from 'electron-store';
import { Logger } from '../error-handling/Logger';

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  language: string;
  volume: number;
  eqState?: {
    gains: number[];
    presets: any[];
    activePreset: string;
    isEnabled: boolean;
  };
  profileName: string;
  avatarUrl?: string;
  localPlaylists?: any[];
}

export class SettingsManager {
  private store: Store<AppSettings>;
  private defaultSettings: AppSettings = {
    theme: 'dark',
    language: 'ru',
    volume: 1.0,
    eqState: {
      gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      presets: [],
      activePreset: 'Flat',
      isEnabled: false
    },
    profileName: '',
    avatarUrl: '',
    localPlaylists: []
  };

  constructor() {
    this.store = new Store<AppSettings>({
      name: 'app_settings',
      defaults: this.defaultSettings
    });
  }

  public getAllSettings(): AppSettings {
    const settings = this.store.store;
    Logger.info(`[SettingsManager] getAllSettings: ${JSON.stringify(settings)}`);
    return settings;
  }

  public updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    this.store.set(key, value);
    Logger.info(`[SettingsManager] updateSetting: ${key} = ${JSON.stringify(value)}`);
  }
}
