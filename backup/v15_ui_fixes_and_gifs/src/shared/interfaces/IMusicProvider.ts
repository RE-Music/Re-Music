export interface Track {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  coverUrl?: string;
  provider: 'spotify' | 'yandex' | 'vk' | 'soundcloud' | 'youtube' | 'local';
  streamUrl?: string; // Для Yandex/VK/Local. Для Spotify используется Web Playback SDK
  likedAt?: number; // Timestamp (ms) when track was liked/added
}

export interface Playlist {
  id: string;
  title: string;
  coverUrl?: string;
  trackCount: number;
}

export interface IMusicProvider {
  readonly id: string;
  readonly name: string;
  auth(): Promise<boolean>;
  play(trackId: string, options?: { deviceId?: string }): Promise<string | void>;
  pause(options?: { deviceId?: string }): Promise<void>;
  search(query: string, page?: number): Promise<Track[]>;
  getPlaylists(): Promise<Playlist[]>;
  getPlaylistTracks?(playlistId: string): Promise<Track[]>;
  likeTrack?(trackId: string, like: boolean): Promise<boolean>;
  getLikedTracks?(): Promise<Track[]>;
  createPlaylist?(title: string): Promise<Playlist | boolean>;
  addTrackToPlaylist?(playlistId: string, trackId: string): Promise<boolean>;
  getRecommendations?(seedTrackId?: string): Promise<Track[]>;
  getUserInfo?(): Promise<{ username: string; avatarUrl?: string } | null>;
}
