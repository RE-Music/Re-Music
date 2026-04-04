export interface IElectronAPI {
  invoke(channel: 'search', args: { providerId: string, query: string }): Promise<Track[]>;
  invoke(channel: 'get-playlists', providerId: string): Promise<Playlist[]>;
  invoke(channel: 'get-playlist-tracks', args: { providerId: string, playlistId: string }): Promise<Track[]>;
  invoke(channel: 'get-liked-tracks'): Promise<Track[]>;
  invoke(channel: 'like-track', args: { providerId: string, trackId: string, like: boolean }): Promise<boolean>;
  invoke(channel: 'play-track', args: { providerId: string, trackId: string }): Promise<string>;
  invoke(channel: 'create-playlist', args: { providerId: string, title: string }): Promise<Playlist | boolean>;
  invoke(channel: 'add-track-to-playlist', args: { providerId: string, playlistId: string, trackId: string }): Promise<boolean>;
  invoke(channel: 'check-auth'): Promise<Record<string, boolean>>;
  invoke(channel: 'auth-provider', providerId: string): Promise<boolean>;
  invoke(channel: 'get-my-wave'): Promise<Track[]>;
  invoke(channel: 'get-track-radio', args: { providerId: string, trackId: string }): Promise<Track[]>;
  invoke(channel: string, ...args: any[]): Promise<any>;
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
