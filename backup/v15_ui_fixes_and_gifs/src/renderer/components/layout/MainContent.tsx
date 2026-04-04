import React, { useState, useEffect } from 'react';
import { Search as SearchIcon, Play, Music, Heart, Plus, ChevronLeft, Check, X, MoreVertical, Activity, Zap, SkipForward, SlidersHorizontal, User } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { SettingsView } from '../views/SettingsView';
import { EqualizerView } from '../views/EqualizerView';
import { getTranslation } from '../../utils/i18n';
import type { Track, Playlist } from '../../../shared/interfaces/IMusicProvider';

export const MainContent = () => {
  const { activeView, activeProviderId, likedTracks, toggleLike, providers, language, authStatus, setAuthStatus, navNonce, setActiveView, theme } = useAppStore();
  const t = getTranslation(language);
  const { 
    playTrack, 
    currentTrack, 
    isPlaying, 
    setQueue, 
    addToQueue,
    setCurrentTrack,
    togglePlayPause,
    progressMs,
    spotifyDeviceId
  } = usePlayerStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isPlaylistsLoading, setIsPlaylistsLoading] = useState(false);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  
  //Liked Songs
  const [likedSongs, setLikedSongs] = useState<Track[]>([]);
  const [likedFilter, setLikedFilter] = useState<'all' | string>('all');
  const [isLoadingLiked, setIsLoadingLiked] = useState(false);
  
  // Search Pagination
  const [searchPage, setSearchPage] = useState(1);

  // Создание плейлиста
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [imgError, setImgError] = useState(false);
  const [fallbackGif, setFallbackGif] = useState('');

  const fallbackGifs = [
    'cat-dance.gif', 'cat-dancer.gif', 'cat-kitten.gif', 'dance.gif', 
    'elgatitolover-elgatito.gif', 'elgatitolover.gif', 'lerolero-funny-cat.gif', 
    'pispoes-zezaar264264.gif', 'racoon-raccoon.gif', 'wiggle-cat-wiggle.gif'
  ];

  useEffect(() => {
    setImgError(false);
    if (!currentTrack?.coverUrl) {
      setImgError(true);
      const randomGif = fallbackGifs[Math.floor(Math.random() * fallbackGifs.length)];
      setFallbackGif(new URL(`../../assets/gifs/${randomGif}`, import.meta.url).href);
    }
  }, [currentTrack]);

  // Добавление в плейлист
  const [showPlaylistMenu, setShowPlaylistMenu] = useState<string | null>(null);

  // Источники для Волны
  const [waveSources, setWaveSources] = useState<string[]>([]);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [waveSeed, setWaveSeed] = useState<Track | null>(null);

  const toggleWaveSource = (id: string) => {
    setWaveSources(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  // Сброс состояния при смене вида или провайдера (ИЗОЛЯЦИЯ)
  useEffect(() => {
    setSearchResults([]);
    setPlaylists([]);
    setActivePlaylist(null);
    setPlaylistTracks([]);
    setSearchQuery('');
    setIsCreating(false);
    setNewTitle('');
    setShowPlaylistMenu(null);
    setSearchPage(1);
    setWaveSeed(null);
    
    if (activeView === 'provider' && activeProviderId) {
      loadLibrary();
    } else if (activeView === 'liked') {
      loadLikedSongs();
    }
  }, [activeView, activeProviderId, navNonce]);

  // Бесконечная Волна - дозагрузка
  useEffect(() => {
    if (activeView !== 'wave' || !currentTrack || playlistTracks.length === 0) return;
    
    const currentIndex = playlistTracks.findIndex(t => t.id === currentTrack.id);
    // Если осталось 3 трека или меньше - грузим еще
    if (currentIndex !== -1 && currentIndex >= playlistTracks.length - 3) {
      console.log('[MainContent] Approaching end of Wave. Fetching more tracks...');
      loadMoreWave();
    }
  }, [currentTrack?.id, activeView, playlistTracks.length]);

  const loadMoreWave = async () => {
    if (isLoadingTracks) return;
    try {
      const moreTracks = waveSeed 
        ? await window.electronAPI.invoke('get-track-radio', { 
            providerId: waveSeed.provider, 
            trackId: waveSeed.id 
          })
        : await window.electronAPI.invoke('get-my-wave', waveSources);
      
      if (moreTracks && moreTracks.length > 0) {
        // Исключаем дубликаты
        const existingIds = new Set(playlistTracks.map(t => t.id));
        const uniqueMore = moreTracks.filter((t: any) => !existingIds.has(t.id));
        
        if (uniqueMore.length > 0) {
          setPlaylistTracks(prev => [...prev, ...uniqueMore]);
          addToQueue(uniqueMore);
          console.log(`[MainContent] Added ${uniqueMore.length} more tracks to wave`);
        }
      }
    } catch (e) {
      console.error('[MainContent] Failed to load more tracks', e);
    }
  };

  const loadLibrary = async () => {
    if (!activeProviderId) return;
    setIsLoadingLibrary(true);
    try {
      const [data, newAuthStatus] = await Promise.all([
        window.electronAPI.invoke('get-playlists', activeProviderId),
        window.electronAPI.invoke('check-auth')
      ]);
      setPlaylists(data);
      setAuthStatus(newAuthStatus);
    } catch (error) {
      console.error('Failed to load library:', error);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const loadLikedSongs = async () => {
    setIsLoadingLiked(true);
    try {
      const tracks = await window.electronAPI.invoke('get-liked-tracks');
      setLikedSongs(tracks);
    } catch (error) {
      console.error('Failed to load liked songs:', error);
    } finally {
      setIsLoadingLiked(false);
    }
  };

  const loadPlaylistTracks = async (playlist: Playlist) => {
    if (!activeProviderId) return;
    setActivePlaylist(playlist);
    setIsLoadingTracks(true);
    try {
      const tracks = await window.electronAPI.invoke('get-playlist-tracks', {
        providerId: activeProviderId as string,
        playlistId: playlist.id
      });
      setPlaylistTracks(tracks);
    } catch (error) {
      console.error('Failed to load playlist tracks:', error);
    } finally {
      setIsLoadingTracks(false);
    }
  };

  const handleAuth = async () => {
    if (!activeProviderId) return;
    const success = await window.electronAPI.invoke('auth-provider', activeProviderId as string);
    if (success) {
      loadLibrary();
    } else {
      const authData = await window.electronAPI.invoke('check-auth');
      setAuthStatus(authData);
    }
  };

  const confirmCreatePlaylist = async () => {
    if (!newTitle.trim() || !activeProviderId) {
      setIsCreating(false);
      return;
    }

    try {
      const result = await window.electronAPI.invoke('create-playlist', { 
        providerId: activeProviderId as string, 
        title: newTitle 
      });
      if (result) {
        loadLibrary();
      } else {
        alert('Failed to create playlist');
      }
    } catch (error) {
      console.error('Failed to create playlist:', error);
    } finally {
      setIsCreating(false);
      setNewTitle('');
    }
  };

  const handleStartWave = async (seedTrack?: Track) => {
    setIsLoadingTracks(true);
    setActivePlaylist(null);
    setActiveView('wave');
    setPlaylistTracks([]);
    setShowPlaylistMenu(null);
    
    try {
      setWaveSeed(seedTrack || null);
      const tracks = seedTrack 
        ? await window.electronAPI.invoke('get-track-radio', { providerId: seedTrack.provider, trackId: seedTrack.id })
        : await window.electronAPI.invoke('get-my-wave', waveSources);
        
      setPlaylistTracks(tracks);
      if (tracks.length > 0) {
        setQueue(tracks);
        // Получаем URL для первого трека и запускаем
        const firstTrack = tracks[0];
        
        if (firstTrack.provider === 'spotify') {
          await window.electronAPI.invoke('play-spotify-uri', {
            deviceId: spotifyDeviceId || undefined, // Fallback to active desktop device if undefined
            trackId: firstTrack.id
          });
          playTrack(firstTrack); // Updates global store without streamUrl
        } else {
          const streamUrl = await window.electronAPI.invoke('play-track', { 
            providerId: firstTrack.provider, 
            trackId: firstTrack.id 
          });
          if (streamUrl) {
            playTrack({ ...firstTrack, streamUrl });
          } else {
            setCurrentTrack(firstTrack);
          }
        }
      }
    } catch (e) {
      console.error('[MainContent] Failed to start wave', e);
    } finally {
      setIsLoadingTracks(false);
    }
  };

  const handleAddToPlaylist = async (playlistId: string, track: Track) => {
    try {
      const success = await window.electronAPI.invoke('add-track-to-playlist', {
        providerId: track.provider,
        playlistId,
        trackId: track.id
      });
      if (success) {
        alert(t.content.addedToPlaylist);
      } else {
        alert(t.content.failedToAdd);
      }
    } catch (error) {
      console.error('Failed to add to playlist:', error);
    } finally {
      setShowPlaylistMenu(null);
    }
  };

  const handleLike = async (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    const isLiked = likedTracks.has(track.id);
    const success = await window.electronAPI.invoke('like-track', {
      providerId: track.provider,
      trackId: track.id,
      like: !isLiked
    });

    if (success) {
      toggleLike(track.id);
      if (activeView === 'liked') {
        loadLikedSongs(); // Refresh for liked view
      }
    }
  };
  
  const handlePageChange = async (delta: number) => {
    const newPage = Math.max(1, searchPage + delta);
    if (newPage === searchPage) return;
    
    setSearchPage(newPage);
    setIsSearching(true);
    try {
      const results = await window.electronAPI.invoke('search', { 
        providerId: searchSource, 
        query: searchQuery,
        page: newPage
      });
      setSearchResults(results);
      // Scroll to top of results
      const resultsEl = document.querySelector('.search-results');
      if (resultsEl) resultsEl.scrollTop = 0;
    } catch (error) {
      console.error('Search pagination failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const [searchSource, setSearchSource] = useState<'all' | 'yandex' | 'spotify' | 'soundcloud' | 'youtube'>('all');

  const handleSearch = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      setIsSearching(true);
      try {
        const results = await window.electronAPI.invoke('search', { 
          providerId: searchSource, 
          query: searchQuery,
          page: 1
        });
        setSearchResults(results);
        setSearchPage(1);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }
  };

  const handlePlay = async (track: Track, tracksContext: Track[] = []) => {
    if (currentTrack?.id === track.id) {
      togglePlayPause();
      return;
    }

    try {
      if (tracksContext.length > 0) {
        setQueue(tracksContext);
      }
      
      if (track.provider === 'spotify') {
        await window.electronAPI.invoke('play-spotify-uri', {
          deviceId: spotifyDeviceId || undefined,
          trackId: track.id
        });
        playTrack(track); // Trigger UI update, no streamUrl needed as backend handles playback
      } else {
        const streamUrl = await window.electronAPI.invoke('play-track', { 
          providerId: track.provider, 
          trackId: track.id 
        });
        
        if (streamUrl) {
          playTrack({ ...track, streamUrl });
        }
      }
    } catch (error) {
      console.error('Failed to play track:', error);
    }
  };

  const filteredLiked = likedSongs.filter(track => 
    likedFilter === 'all' || track.provider === likedFilter
  );

  return (
    <div className="main-content">
      {activeView === 'home' && (
        <div className="home-view">
          {theme === 'old-dark' ? (
            <div className="legacy-home">
              <h1 className="legacy-welcome">Добро пожаловать в Nano-Mus</h1>
              <p className="legacy-subtitle">Ваша единая библиотека музыки</p>
              
              <div className="legacy-service-grid">
                {providers.filter(p => p.id !== 'youtube' && p.id !== 'soundcloud').map(p => (
                  <div key={p.id} className="legacy-service-card" onClick={() => setActiveView('provider', p.id)}>
                    <div className="card-header">{p.name.toUpperCase()}</div>
                    <div className="card-status">{authStatus[p.id] ? 'Ready' : 'Not Connected'}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <span className="section-label">Ваши подборки</span>
              
              <div className="mixes-grid">
                <div className="mix-card" onClick={() => handleStartWave()}>
                  <div className="mix-cover" style={{ backgroundImage: 'linear-gradient(135deg, #00f2ff, #0066ff)' }}></div>
                  <div className="mix-title">Daft Punk Radio</div>
                  <div className="mix-subtitle">Сгенерировано для вас</div>
                </div>
                <div className="mix-card">
                  <div className="mix-cover" style={{ backgroundImage: 'linear-gradient(135deg, #222, #000)' }}></div>
                  <div className="mix-title">Night Drive</div>
                  <div className="mix-subtitle">Deep Techno / Cyberpunk</div>
                </div>
                <div className="mix-card">
                  <div className="mix-cover" style={{ backgroundImage: 'linear-gradient(135deg, #ff0080, #7928ca)' }}></div>
                  <div className="mix-title">Focus Flow</div>
                  <div className="mix-subtitle">Lo-fi Tech Beats</div>
                </div>
              </div>

              <span className="section-label">Продолжить прослушивание</span>
              <div className="mixes-grid">
                <div className="mix-card">
                  <div className="mix-cover" style={{ backgroundColor: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Music size={64} color="var(--accent-color)" opacity={0.2} />
                  </div>
                  <div className="mix-title">Liked Songs</div>
                  <div className="mix-subtitle">{likedTracks.size} tracks</div>
                </div>
                <div className="mix-card">
                  <div className="mix-cover" style={{ backgroundImage: 'linear-gradient(135deg, #333, #111)' }}></div>
                  <div className="mix-title">Recent Mix</div>
                  <div className="mix-subtitle">Updated 2h ago</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeView === 'search' && (
        <div className="search-view">
          <div className="search-categories">
            <button 
              className={`category-tab ${searchSource === 'all' ? 'active' : ''}`}
              onClick={() => setSearchSource('all')}
            >
              {t.content.all}
            </button>
            <button 
              className={`category-tab ${searchSource === 'yandex' ? 'active' : ''}`}
              data-provider="yandex"
              onClick={() => setSearchSource('yandex')}
            >
              Yandex Music
            </button>
            <button 
              className={`category-tab ${searchSource === 'spotify' ? 'active' : ''}`}
              data-provider="spotify"
              onClick={() => setSearchSource('spotify')}
            >
              Spotify
            </button>
            <button 
              className={`category-tab ${searchSource === 'soundcloud' ? 'active' : ''}`}
              data-provider="soundcloud"
              onClick={() => setSearchSource('soundcloud')}
            >
              SoundCloud
            </button>
          </div>

          <div className="search-bar">
            <SearchIcon size={20} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder={t.content.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
            />
          </div>
          
          <div className="search-results">
            {isSearching ? (
              <p className="loading-text">{t.content.searching}</p>
            ) : searchResults.length > 0 ? (
              <div className="track-list">
                {searchResults.map((track, index) => (
                  <div 
                    key={track.id} 
                    className={`track-item ${showPlaylistMenu === track.id ? 'active-menu' : ''} ${currentTrack?.id === track.id ? 'active' : ''}`} 
                    onClick={() => handlePlay(track, searchResults)}
                  >
                    <div className="track-play-icon">
                      {currentTrack?.id === track.id ? (
                        isPlaying ? <Activity size={16} className="pulse" /> : <Music size={16} />
                      ) : (
                        <Play size={16} fill="currentColor" />
                      )}
                    </div>
                    {track.coverUrl && (
                      <img src={track.coverUrl} className="track-cover-small" alt="" />
                    )}
                    <div className="track-info">
                      <div className="track-title">{track.title}</div>
                      <div className="track-artist">{track.artist}</div>
                    </div>
                    <div className="track-actions">
                      <button 
                        className={`action-btn ${likedTracks.has(track.id) ? 'active' : ''}`}
                        onClick={(e) => handleLike(e, track)}
                      >
                        <Heart size={18} fill={likedTracks.has(track.id) ? "var(--accent-color)" : "none"} />
                      </button>
                      <div className="menu-container">
                        <button 
                          className="action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            const isOpening = showPlaylistMenu !== track.id;
                            setShowPlaylistMenu(isOpening ? track.id : null);
                            
                            if (isOpening) {
                              setIsPlaylistsLoading(true);
                              window.electronAPI.invoke('get-playlists', track.provider)
                                .then(setPlaylists)
                                .finally(() => setIsPlaylistsLoading(false));
                            }
                          }}
                        >
                          <MoreVertical size={18} />
                        </button>
                        {showPlaylistMenu === track.id && (
                          <div className={`playlist-mini-menu ${index > searchResults.length - 4 ? 'upward' : ''}`}>
                            <div className="menu-header">{t.content.addToPlaylist}</div>
                            <div className="menu-content">
                              {isPlaylistsLoading ? (
                                <div className="menu-loading">
                                  <div className="spinner-small" />
                                </div>
                              ) : (
                                <>
                                  <div 
                                    className="menu-item highlight"
                                    onClick={(e) => { e.stopPropagation(); setIsCreating(true); setShowPlaylistMenu(null); }}
                                  >
                                    <Plus size={14} style={{ marginRight: '8px' }} />
                                    {t.content.createPlaylist}
                                  </div>
                                  <div 
                                    className="menu-item highlight"
                                    style={{ color: 'var(--accent-color)' }}
                                    onClick={(e) => { e.stopPropagation(); handleStartWave(track); }}
                                  >
                                    <Activity size={14} style={{ marginRight: '8px' }} />
                                    Запустить волну
                                  </div>
                                  <div className="menu-divider" style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                                  {playlists.length > 0 ? (
                                    playlists.map(p => (
                                      <div 
                                        key={p.id} 
                                        className="menu-item"
                                        onClick={(e) => { e.stopPropagation(); handleAddToPlaylist(p.id, track); }}
                                      >
                                        {p.title}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="menu-empty">
                                      {track.provider === 'soundcloud' ? 'No SoundCloud playlists' : 'No playlists found'}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="track-duration">{Math.floor(track.durationMs / 60000)}:{String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="loading-text">{t.content.startTyping}</p>
            )}
            
            {searchResults.length > 0 && !isSearching && (
              <div className="search-pagination">
                <button 
                  className="page-btn" 
                  disabled={searchPage === 1}
                  onClick={() => handlePageChange(-1)}
                >
                  <ChevronLeft size={16} /> Назад
                </button>
                <span className="page-info">Страница {searchPage}</span>
                <button 
                  className="page-btn" 
                  disabled={searchResults.length < 20}
                  onClick={() => handlePageChange(1)}
                >
                  Вперед <SkipForward size={16} style={{ marginLeft: '4px' }} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'settings' && <SettingsView />}

      {activeView === 'eq' && <EqualizerView />}

      {activeView === 'profile' && (
        <div className="profile-view premium-view">
          <div className="profile-hero">
            <div className="profile-avatar-large">
              {Object.entries(authStatus).find(([id, connected]) => connected && (id === 'spotify' || id === 'yandex')) ? (
                <div className="avatar-wrapper">
                  <div className="avatar-glow"></div>
                  <User size={64} className="avatar-icon" />
                </div>
              ) : (
                <User size={64} color="var(--accent-color)" opacity={0.3} />
              )}
            </div>
            <div className="profile-info-large">
              <div className="premium-badge">Nano-Mus Premium</div>
              <h1>Твой Профиль</h1>
              <div className="profile-meta">
                <span className="user-nickname">
                  {Object.entries(authStatus).find(([id, connected]) => connected && id === 'spotify') ? 'Spotify User' : 
                   Object.entries(authStatus).find(([id, connected]) => connected && id === 'yandex') ? 'Yandex User' : 'Guest Member'}
                </span>
                <span className="status-dot-active">Online</span>
              </div>
            </div>
          </div>

          <div className="profile-stats grid-2">
            <div className="stat-card hud-box">
              <div className="stat-icon-wrapper">
                <Music size={20} color="var(--accent-color)" />
              </div>
              <div className="stat-info">
                <span className="stat-label">Подключено сервисов</span>
                <span className="stat-value">{Object.values(authStatus).filter(Boolean).length} / {providers.length}</span>
              </div>
            </div>
            <div className="stat-card hud-box">
              <div className="stat-icon-wrapper">
                <Heart size={20} color="#ff3366" />
              </div>
              <div className="stat-info">
                <span className="stat-label">Любимых треков</span>
                <span className="stat-value">{likedTracks.size}</span>
              </div>
            </div>
          </div>

          <div className="profile-achievements">
             <span className="section-label">Достижения</span>
             <div className="achievements-row">
                <div className="achievement-item locked" title="Early Adopter">🚀</div>
                <div className="achievement-item active" title="Music Lover">🎧</div>
                <div className="achievement-item locked" title="Equalizer Pro">⚗️</div>
                <div className="achievement-item active" title="Daft Punk Fan">💿</div>
             </div>
          </div>
        </div>
      )}

      {activeView === 'liked' && (
        <div className="liked-view">
          <div className="provider-header">
            <h1>{t.content.likedSongs}</h1>
            <div className="filter-tabs">
              <button 
                className={`tab ${likedFilter === 'all' ? 'active' : ''}`}
                onClick={() => setLikedFilter('all')}
              >{t.content.all}</button>
              {providers.map(p => (
                <button 
                  key={p.id}
                  className={`tab ${likedFilter === p.id ? 'active' : ''}`}
                  onClick={() => setLikedFilter(p.id)}
                >{p.name}</button>
              ))}
            </div>
          </div>

          <div className="track-list">
            {isLoadingLiked ? (
              <p className="loading-text">{t.content.loadingFavorites}</p>
            ) : filteredLiked.length > 0 ? (
              filteredLiked.map((track, index) => (
                <div 
                  key={track.id} 
                  className={`track-item ${showPlaylistMenu === track.id ? 'active-menu' : ''} ${currentTrack?.id === track.id ? 'active' : ''}`} 
                  onClick={() => handlePlay(track, filteredLiked)}
                >
                  <div className="track-play-icon">
                    {currentTrack?.id === track.id ? (
                      isPlaying ? <Activity size={16} className="pulse" /> : <Music size={16} />
                    ) : (
                      <Play size={16} fill="currentColor" />
                    )}
                  </div>
                  {track.coverUrl && (
                    <img src={track.coverUrl} className="track-cover-small" alt="" />
                  )}
                  <div className="track-info">
                    <div className="track-title">{track.title}</div>
                    <div className="track-artist">{track.artist}</div>
                  </div>
                  <div className="track-actions">
                    <button 
                      className={`action-btn active`}
                      onClick={(e) => handleLike(e, track)}
                    >
                      <Heart size={18} fill="var(--accent-color)" />
                    </button>
                    <div className="menu-container">
                      <button 
                        className="action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPlaylistMenu(showPlaylistMenu === track.id ? null : track.id);
                          // Fetch playlists if not available or for correct provider
                          if (playlists.length === 0 || activeProviderId !== track.provider) {
                            window.electronAPI.invoke('get-playlists', track.provider).then(setPlaylists);
                          }
                        }}
                      >
                        <MoreVertical size={18} />
                      </button>
                      {showPlaylistMenu === track.id && (
                        <div className={`playlist-mini-menu ${index > filteredLiked.length - 4 ? 'upward' : ''}`}>
                          <div className="menu-header">{t.content.addToPlaylist}</div>
                          <div className="menu-content">
                            <div 
                              className="menu-item highlight"
                              style={{ color: 'var(--accent-color)' }}
                              onClick={(e) => { e.stopPropagation(); handleStartWave(track); }}
                            >
                              <Activity size={14} style={{ marginRight: '8px' }} />
                              Запустить волну
                            </div>
                            <div className="menu-divider" style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                            {isPlaylistsLoading ? (
                              <div className="menu-loading">
                                <div className="spinner-small" />
                              </div>
                            ) : (
                              <>
                                <div 
                                  className="menu-item highlight"
                                  onClick={(e) => { e.stopPropagation(); setIsCreating(true); setShowPlaylistMenu(null); }}
                                >
                                  <Plus size={14} style={{ marginRight: '8px' }} />
                                  {t.content.createPlaylist}
                                </div>
                                {playlists.length > 0 ? (
                                  playlists.map(p => (
                                    <div 
                                      key={p.id} 
                                      className="menu-item"
                                      onClick={(e) => { e.stopPropagation(); handleAddToPlaylist(p.id, track); }}
                                    >
                                      {p.title}
                                    </div>
                                  ))
                                ) : (
                                  <div className="menu-empty">
                                    {track.provider === 'soundcloud' ? 'No SoundCloud playlists' : 'No playlists found'}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="track-provider">{track.provider}</div>
                  <div className="track-duration">{Math.floor(track.durationMs / 60000)}:{String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}</div>
                </div>
              ))
            ) : (
              <p className="loading-text">{t.content.noLiked}</p>
            )}
          </div>
        </div>
      )}

      {activeView === 'provider' && (
        <div className="provider-view">
          {activePlaylist ? (
            <div className="playlist-detail-view">
              <button className="back-btn" onClick={() => setActivePlaylist(null)}>
                <ChevronLeft size={20} /> {t.content.backToLibrary}
              </button>
              
              <div className="playlist-header-large">
                <div className="playlist-cover-large">
                  {activePlaylist.coverUrl ? (
                    <img src={activePlaylist.coverUrl} alt={activePlaylist.title} />
                  ) : (
                    <Music size={80} color="var(--text-muted)" />
                  )}
                </div>
                <div className="playlist-info-large">
                  <span className="label">{t.content.playlist}</span>
                  <h1>{activePlaylist.title}</h1>
                  <p>{activePlaylist.trackCount} {t.content.tracksCount}</p>
                </div>
              </div>

              <div className="track-list">
                {isLoadingTracks ? (
                  <p className="loading-text">{t.content.loadingTracks}</p>
                ) : playlistTracks.length > 0 ? (
                  playlistTracks.map((track, index) => (
                    <div 
                      key={track.id} 
                      className={`track-item ${showPlaylistMenu === track.id ? 'active-menu' : ''} ${currentTrack?.id === track.id ? 'active' : ''}`} 
                      onClick={() => handlePlay(track, playlistTracks)}
                    >
                      <div className="track-play-icon">
                        {currentTrack?.id === track.id ? (
                          isPlaying ? <Activity size={16} className="pulse" /> : <Music size={16} />
                        ) : (
                          <Play size={16} fill="currentColor" />
                        )}
                      </div>
                      <div className="track-info">
                        <div className="track-title">{track.title}</div>
                        <div className="track-artist">{track.artist}</div>
                      </div>
                      <div className="track-actions">
                        <button 
                          className={`action-btn ${likedTracks.has(track.id) ? 'active' : ''}`}
                          onClick={(e) => handleLike(e, track)}
                        >
                          <Heart size={18} fill={likedTracks.has(track.id) ? "var(--accent-color)" : "none"} />
                        </button>
                        <div className="menu-container">
                          <button 
                            className="action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const isOpening = showPlaylistMenu !== track.id;
                              setShowPlaylistMenu(isOpening ? track.id : null);
                              if (isOpening) {
                                setIsPlaylistsLoading(true);
                                window.electronAPI.invoke('get-playlists', track.provider)
                                  .then(setPlaylists)
                                  .finally(() => setIsPlaylistsLoading(false));
                              }
                            }}
                          >
                            <MoreVertical size={18} />
                          </button>
                          {showPlaylistMenu === track.id && (
                            <div className={`playlist-mini-menu ${index > playlistTracks.length - 4 ? 'upward' : ''}`}>
                              <div className="menu-header">{t.content.addToPlaylist}</div>
                              <div className="menu-content">
                                {isPlaylistsLoading ? (
                                  <div className="menu-loading"><div className="spinner-small" /></div>
                                ) : (
                                  <>
                                      <div 
                                        className="menu-item highlight"
                                        onClick={(e) => { e.stopPropagation(); setIsCreating(true); setShowPlaylistMenu(null); }}
                                      >
                                        <Plus size={14} style={{ marginRight: '8px' }} />
                                        {t.content.createPlaylist}
                                      </div>
                                      <div 
                                        className="menu-item highlight"
                                        style={{ color: 'var(--accent-color)' }}
                                        onClick={(e) => { e.stopPropagation(); handleStartWave(track); }}
                                      >
                                        <Activity size={14} style={{ marginRight: '8px' }} />
                                        Запустить волну
                                      </div>
                                    {playlists.length > 0 ? (
                                      playlists.map(p => (
                                        <div 
                                          key={p.id} 
                                          className="menu-item"
                                          onClick={(e) => { e.stopPropagation(); handleAddToPlaylist(p.id, track); }}
                                        >
                                          {p.title}
                                        </div>
                                      ))
                                    ) : (
                                      <div className="menu-empty">
                                        {track.provider === 'soundcloud' ? 'No SoundCloud playlists' : 'No playlists found'}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="track-provider">{track.provider}</div>
                      <div className="track-duration">{Math.floor(track.durationMs / 60000)}:{String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}</div>
                    </div>
                  ))
                ) : (
                  <p className="loading-text">{t.content.emptyPlaylist}</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="provider-header">
                <h1>{activeProviderId === 'yandex' ? 'Yandex Music' : activeProviderId}</h1>
                <div className="header-actions">
                  {isCreating ? (
                    <div className="create-playlist-input glass-panel">
                      <input 
                        autoFocus 
                        type="text" 
                        placeholder={t.content.playlistName}
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && confirmCreatePlaylist()}
                      />
                      <button onClick={confirmCreatePlaylist} className="icon-btn-small success">
                        <Check size={16} />
                      </button>
                      <button onClick={() => setIsCreating(false)} className="icon-btn-small danger">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <button className="icon-btn glass-panel" onClick={() => setIsCreating(true)} title={t.content.createPlaylist}>
                      <Plus size={20} />
                    </button>
                  )}
                  <button className="auth-btn glass-panel" onClick={handleAuth}>
                    {(activeProviderId && authStatus[activeProviderId]) ? t.content.reauthorize : t.content.authorize}
                  </button>
                </div>
              </div>

              <div className="library-section">
                <h2>{t.content.yourPlaylists}</h2>
                {isLoadingLibrary ? (
                  <p className="loading-text">{t.content.loadingLibrary}</p>
                ) : playlists.length > 0 ? (
                  <div className="playlist-grid">
                    {playlists.map((playlist) => (
                      <div key={playlist.id} className="playlist-card glass-panel" onClick={() => loadPlaylistTracks(playlist)}>
                        <div className="playlist-cover">
                          {playlist.coverUrl ? (
                            <img src={playlist.coverUrl} alt={playlist.title} />
                          ) : (
                            <Music size={48} color="var(--text-muted)" />
                          )}
                        </div>
                        <div className="playlist-info">
                          <div className="playlist-title">{playlist.title}</div>
                          <div className="playlist-tracks">{playlist.trackCount} {t.content.tracksCount}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-library">
                    <p>{t.content.noPlaylists}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {activeView === 'wave' && (
        <div className="playlist-detail-view wave-view">
          <div className="playlist-header-large" style={{ position: 'relative' }}>
            <div className="playlist-cover-large wave-cover glass-panel">
               <Zap size={80} color="var(--accent-color)" />
            </div>
            <div className="playlist-info-large">
              <span className="label">Персональный поток</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <h1 style={{ margin: 0 }}>Моя волна</h1>
                <button 
                  className="icon-btn glass-panel wave-refresh-btn" 
                  onClick={() => handleStartWave()} 
                  title="Обновить волну"
                >
                  <Activity size={18} />
                </button>
              </div>
              <p>Бесконечная музыка на ваш вкус со всех площадок</p>
              
              <div className="wave-source-selector">
                <button 
                  className="source-menu-btn glass-panel"
                  onClick={() => setShowSourceMenu(!showSourceMenu)}
                >
                  <SlidersHorizontal size={14} style={{ marginRight: '8px' }} />
                  Играть с: {waveSources.length === 0 ? 'Микс' : waveSources.length === 1 ? providers.find(p => p.id === waveSources[0])?.name : `${waveSources.length} площадки`}
                </button>

                {showSourceMenu && (
                  <div className="source-dropdown glass-panel">
                    <div 
                      className={`source-item ${waveSources.length === 0 ? 'active' : ''}`}
                      onClick={() => { setWaveSources([]); setShowSourceMenu(false); handleStartWave(); }}
                    >
                      <Zap size={14} />
                      <span>Микс (Все)</span>
                      {waveSources.length === 0 && <Check size={14} className="check-icon" />}
                    </div>
                    <div className="menu-divider" />
                    {providers.map(p => (
                      <div 
                        key={p.id}
                        className={`source-item ${waveSources.includes(p.id) ? 'active' : ''}`}
                        onClick={() => toggleWaveSource(p.id)}
                      >
                        <div className="provider-indicator-small" data-provider={p.id} />
                        <span>{p.name}</span>
                        {waveSources.includes(p.id) && <Check size={14} className="check-icon" />}
                      </div>
                    ))}
                    {waveSources.length > 0 && (
                      <button 
                        className="apply-btn"
                        onClick={() => { setShowSourceMenu(false); handleStartWave(); }}
                      >
                        Применить
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="track-list">
            {isLoadingTracks ? (
              <p className="loading-text">Настраиваем вашу волну...</p>
            ) : playlistTracks.length > 0 ? (
              playlistTracks.map((track, index) => (
                <div 
                  key={track.id + '-' + index} 
                  className={`track-item ${showPlaylistMenu === track.id ? 'active-menu' : ''} ${currentTrack?.id === track.id ? 'active' : ''}`} 
                  onClick={() => handlePlay(track)}
                >
                  <div className="track-play-icon">
                    {currentTrack?.id === track.id ? (
                      isPlaying ? <Activity size={16} className="pulse" /> : <Music size={16} />
                    ) : (
                      <Play size={16} fill="currentColor" />
                    )}
                  </div>
                  {track.coverUrl && (
                    <img src={track.coverUrl} className="track-cover-small" alt="" />
                  )}
                  <div className="track-info">
                    <div className="track-title">{track.title}</div>
                    <div className="track-artist">{track.artist}</div>
                  </div>
                  <div className="track-actions">
                    <button 
                      className={`action-btn ${likedTracks.has(track.id) ? 'active' : ''}`}
                      onClick={(e) => handleLike(e, track)}
                    >
                      <Heart size={18} fill={likedTracks.has(track.id) ? "var(--accent-color)" : "none"} />
                    </button>
                  </div>
                  <div className="track-provider">{track.provider}</div>
                  <div className="track-duration">{Math.floor(track.durationMs / 60000)}:{String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}</div>
                </div>
              ))
            ) : (
              <p className="loading-text">Волна пока пуста. Попробуйте обновить.</p>
            )}
          </div>
        </div>
      )}
      {activeView === 'focus' && (
        <div className="focus-view">
          <div 
            className="focus-background" 
            style={{ backgroundImage: `url(${currentTrack?.coverUrl || ''})` }}
          />
          <div className="focus-ambient-glow" />
          <div className="focus-overlay" />
          <div className="mini-hologrid" />
          <div className="mini-scanline" />
          <div className="mini-crt-lines" />
          
          <div className="mini-header-tag focus-hud-tag">
            <span className="mini-tag-line">SYSTEM: NMIS-V9</span>
            <span className="mini-status-tag">STATUS: {isPlaying ? 'STREAMING' : 'READY'}</span>
          </div>

          <button className="focus-back-btn" onClick={() => setActiveView('home')}>
            <ChevronLeft size={24} />
          </button>

          {currentTrack ? (
            <div className="focus-container ultimate-focus">
              <div className="mini-cover-outer focus-cover-hud">
                <svg className="mini-progress-ring focus-ring-large" viewBox="0 0 230 230">
                  <circle
                    className="progress-ring-bg"
                    cx="115"
                    cy="115"
                    r="112"
                    fill="transparent"
                  />
                  <circle
                    className="progress-ring-circle"
                    cx="115"
                    cy="115"
                    r="112"
                    fill="transparent"
                    strokeDasharray={`${2 * Math.PI * 112}`}
                    strokeDashoffset={`${2 * Math.PI * 112 * (1 - (progressMs / (currentTrack.durationMs || 1)))}`}
                  />
                </svg>
                <div className={`mini-cover-wrapper focus-wrapper-large ${isPlaying ? 'playing' : ''} ${imgError ? 'fallback-mode' : ''}`}>
                  <img 
                    src={imgError ? fallbackGif : (currentTrack.coverUrl || '')} 
                    className="mini-cover" 
                    alt="" 
                    onError={() => {
                      if (!imgError) {
                        setImgError(true);
                        const randomGif = fallbackGifs[Math.floor(Math.random() * fallbackGifs.length)];
                        setFallbackGif(new URL(`../../assets/gifs/${randomGif}`, import.meta.url).href);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="focus-info">
                <div className="focus-meta-tag">{currentTrack.provider.toUpperCase()} // DAFT_PUNK_PROTOCOL_S9</div>
                <h1 className="focus-title ultimate premium-font">{currentTrack.title}</h1>
                <h2 className="focus-artist ultimate">{currentTrack.artist}</h2>
              </div>
            </div>
          ) : (
            <div className="focus-empty">
              <Music size={80} color="var(--accent-color)" opacity={0.3} />
              <p className="premium-font">{t.content.noTrackPlaying}</p>
            </div>
          )}

          <div className="mini-footer-tag focus-footer">
            X-AXIS: {Math.floor(progressMs / 1000)}s // Y-AXIS: {Math.floor((currentTrack?.durationMs || 0) / 1000)}s // HUD_ACTIVE
          </div>
        </div>
      )}
    </div>
  );
};
