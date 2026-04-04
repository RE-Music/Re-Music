import type { IMusicProvider } from '../../../shared/interfaces/IMusicProvider';
import { SpotifyProvider } from '../../plugins/spotify/SpotifyProvider';
import { YandexProvider } from '../../plugins/yandex/YandexProvider';
import { SoundCloudProvider } from '../../plugins/soundcloud/SoundCloudProvider';
import { YouTubeMusicProvider } from '../../plugins/youtube/YouTubeMusicProvider';
import { AuthManager } from '../auth/AuthManager';
import { Logger } from '../error-handling/Logger';

export class PluginLoader {
  private providers: Map<string, IMusicProvider> = new Map();

  constructor(private authManager: AuthManager) {}

  public loadInternalPlugins() {
    Logger.info('[PluginLoader] Loading internal plugins...');
    
    const spotify = new SpotifyProvider(this.authManager);
    const yandex = new YandexProvider(this.authManager);
    const soundcloud = new SoundCloudProvider(this.authManager);
    const youtube = new YouTubeMusicProvider(this.authManager);

    this.providers.set(spotify.id, spotify);
    this.providers.set(yandex.id, yandex);
    this.providers.set(soundcloud.id, soundcloud);
    this.providers.set(youtube.id, youtube); 

    Logger.info(`[PluginLoader] Loaded ${this.providers.size} plugins.`);
  }

  public getProvider(id: string): IMusicProvider | undefined {
    return this.providers.get(id);
  }

  public getAllProviders(): IMusicProvider[] {
    return Array.from(this.providers.values());
  }

  public cleanup() {
    YouTubeMusicProvider.cleanup(); 
  }
}
