import React, { useState, useEffect } from 'react';
import { 
  Search as SearchIcon, 
  Play, 
  Music, 
  Heart, 
  Plus, 
  ChevronLeft, 
  Check, 
  X, 
  MoreVertical, 
  Activity, 
  Zap, 
  SkipForward, 
  SlidersHorizontal, 
  User,
  Trophy, 
  Disc, 
  Settings, 
  Moon,
  Waves,
  Newspaper,
  Library,
  Trash2,
  Clock,
  ArrowRight,
  Share,
  Minus
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { LocalPlaylist } from '../../store/useAppStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useAchievementStore } from '../../store/useAchievementStore';
import { SettingsView } from '../views/SettingsView';
import { EqualizerView } from '../views/EqualizerView';
import { getTranslation } from '../../utils/i18n';
import type { Track, Playlist } from '../../../shared/interfaces/IMusicProvider';

const fallbackGifs = [
  'cat-dance.gif', 'cat-dancer.gif', 'cat-kitten.gif', 'dance.gif',
  'elgatitolover-elgatito.gif', 'elgatitolover.gif', 'lerolero-funny-cat.gif',
  'pispoes-zezaar264264.gif', 'racoon-raccoon.gif', 'wiggle-cat-wiggle.gif'
];

const getFallbackGif = (mode: string = 'cats') => {
  let filtered = fallbackGifs;
  if (mode === 'cats') {
    filtered = fallbackGifs.filter(g => g.includes('cat') || g.includes('gatiti') || g.includes('pispoes'));
  }
  const randomGif = filtered[Math.floor(Math.random() * filtered.length)];
  return `/assets/gifs/${randomGif}`;
};

export const ACHIEVEMENTS = [
  { id: 'music-lover', title: 'Music Lover', description: 'Больше 100 лайков в коллекции', icon: Heart },
  { id: 'nexus-pioneer', title: 'Nexus Pioneer', description: 'Один из первых пользователей Nexus', icon: Trophy },
  { id: 'daft-punk', title: 'Daft Punk Oracle', description: 'Слушал Daft Punk больше 24 часов', icon: Disc },
  { id: 'eq-master', title: 'Equalizer Master', description: 'Ваш звук — ваши правила. Создан кастомный пресет.', icon: Settings },
  { id: 'sound-explorer', title: 'Sound Explorer', description: 'Мир без границ. Подключено более 3 сервисов.', icon: Zap },
  { id: 'night-owl', title: 'Night Owl', description: 'Ночные ритмы. Послушано в глубокую ночь.', icon: Moon },
  { id: 'vibe-master', title: 'Vibe Master', description: 'Мастер атмосферы. Режим Vibe изменен.', icon: Zap },
  { id: 'first-wave', title: 'First Wave', description: 'Поймай волну. Впервые запущен режим Wave.', icon: Waves },
  { id: 'alpha-pioneer', title: 'Alpha Pioneer', description: 'Участие в тестировании версии 1.0.9', icon: Trophy },
  { id: 'cosmic-pathfinder', title: 'Cosmic Pathfinder', description: 'Исследованы все основные разделы Nexus', icon: Zap },
  { id: 'audiophile', title: 'Audiophile', description: 'Ваш слух безупречен. Эквалайзер открыт впервые.', icon: SlidersHorizontal },
  { id: 'social-butterfly', title: 'Social Butterfly', description: 'Душа компании. Скопирован код для обмена музыкой.', icon: Share },
  { id: 'curator', title: 'Curator', description: 'Начало коллекции. Создан первый локальный плейлист.', icon: Library },
  { id: 'history-buff', title: 'History Buff', description: 'В курсе событий. Прочитаны подробности патч-ноута.', icon: Newspaper },
];

const NEWS_ITEMS = [
  {
    id: 5,
    title: 'Версия 1.0.9: Навигация и UX',
    content: 'Плавные переходы, умная навигация и новый дизайн кнопок лайков.',
    fullContent: 'Большое обновление интерфейса:\n- Плавные анимации появления «Моей волны».\n- Умная навигация: возвращайтесь в предыдущий раздел при сворачивании плеера.\n- Обновлен дизайн кнопок лайков (Nexus Style).\n- Отключено стандартное контекстное меню для стабильности.',
    date: '23 Мар 2026',
    badge: 'NEW',
    icon: Zap
  },
  {
    id: 1,
    title: 'Запуск системы достижений',
    content: 'Протоколы Nexus обновлены. Исследуйте приложение, чтобы разблокировать награды!',
    fullContent: 'Мы рады представить первую версию системы достижений. Теперь ваши действия в приложении вознаграждаются. Ищите пасхалки, подключайте новые сервисы и становитесь мастером звука.',
    date: '21 Мар 2026',
    badge: 'ACHIEVEMENTS',
    icon: Trophy
  },
  {
    id: 2,
    title: 'Эквалайзер: Исправление',
    content: 'Настройте свой идеальный звук. Исправлено сохранение пресетов.',
    fullContent: 'Мы полностью переработали сохранение состояния эквалайзера. Кастомные пресеты теперь сохраняются на диск мгновенно. Также исправлена ошибка с ачивкой.',
    date: '21 Мар 2026',
    badge: 'FIX',
    icon: Settings
  }
];

export const MainContent: React.FC = () => {
  console.log('[DEBUG] MainContent v8.1 rendering');
  const { 
    activeView, 
    activeProviderId, 
    likedTracks, 
    toggleLike, 
    providers, 
    language, 
    authStatus, 
    setAuthStatus, 
    navNonce, 
    setActiveView, 
    vibeGifMode,
    vibeTracks,
    setVibeTracks,
    isVibeLoading,
    setVibeLoading,
    profileName,
    avatarUrl,
    setAvatarUrl,
    localPlaylists,
    loadLocalPlaylists,
    showPrompt,
    isImportModalOpen,
    setImportModalOpen,
    previousView,
    previousProviderId
  } = useAppStore();
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
  const [activePlaylist, setActivePlaylist] = useState<any | null>(null);
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
  const { showToast } = useAppStore();
  const achievementStore = useAchievementStore();
  const [profileTab, setProfileTab] = useState<'overview' | 'achievements'>('overview');
  const [imgError, setImgError] = useState(false);

  // Performance Optimization: Infinite Scroll
  const [visibleCount, setVisibleCount] = useState(50);

  useEffect(() => {
    if (profileTab === 'achievements') {
      achievementStore.init();
    }
  }, [profileTab]);

  useEffect(() => {
    setImgError(false);
    if (!currentTrack?.coverUrl) {
      setImgError(true);
      setCurrentVibeGif(getFallbackGif(vibeGifMode)); // Sync fallback
    }
  }, [currentTrack]);

  // Добавление в плейлист
  const [showPlaylistMenu, setShowPlaylistMenu] = useState<string | null>(null);

  // Источники для Волны
  const [waveSources, setWaveSources] = useState<string[]>([]);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [selectedNews, setSelectedNews] = useState<typeof NEWS_ITEMS[0] | null>(null);

  const toggleWaveSource = (id: string) => {
    setWaveSources(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  // Стабилизация гифки для Волны
  const [currentVibeGif, setCurrentVibeGif] = useState(getFallbackGif(vibeGifMode));

  useEffect(() => {
    if (activeView === 'wave' && isPlaying) {
      setCurrentVibeGif(getFallbackGif(vibeGifMode));
    }
  }, [currentTrack?.id, vibeGifMode]);

  // Сброс состояния при смене вида или провайдера (ИЗОЛЯЦИЯ)
  useEffect(() => {
    setSearchResults([]);
    setPlaylists([]);
    setActivePlaylist(null);
    setSearchPage(1);
    setVisibleCount(50); // Reset performance window
    
    // Note: vibeTracks are NOT cleared here anymore to ensure persistence across tab switches.
    
    if (activeView === 'provider' && activeProviderId) {
      console.log(`[MainContent] Switching to provider: ${activeProviderId}`);
      loadLibrary();
    } else if (activeView === 'liked') {
      loadLikedSongs();
    } else if (activeView === 'home' || activeView === 'local_playlists') {
      loadLocalPlaylists();
    }
    
    // Закрываем модальное окно импорта при смене вкладки
    setImportModalOpen(false);
  }, [activeView, activeProviderId, navNonce, setImportModalOpen]);



  useEffect(() => {
    console.log('[MainContent] authStatus updated:', authStatus);
    
    // Night Owl Check
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) {
      achievementStore.unlock('night-owl');
    }
  }, [authStatus]);

  useEffect(() => {
    if (activeView === 'eq') {
      achievementStore.unlock('audiophile');
    }
  }, [activeView]);

  // Бесконечная Волна - дозагрузка
  useEffect(() => {
    if (activeView !== 'wave' || !currentTrack || vibeTracks.length === 0) return;
    
    const currentIndex = vibeTracks.findIndex(t => t.id === currentTrack.id);
    // Если осталось 3 трека или меньше - грузим еще
    if (currentIndex !== -1 && currentIndex >= vibeTracks.length - 3) {
      console.log('[MainContent] Approaching end of Wave. Fetching more tracks...');
      loadMoreWave();
    }
  }, [currentTrack?.id, activeView, vibeTracks.length]);

  const loadMoreWave = async () => {
    if (isVibeLoading || vibeTracks.length === 0) return;
    
    // Create a map of the last seed for each provider in current playlist
    const seeds: Record<string, string> = {};
    for (let i = vibeTracks.length - 1; i >= 0; i--) {
      const t = vibeTracks[i];
      if (!seeds[t.provider]) {
        seeds[t.provider] = t.id;
      }
      // If we have seeds for all active providers, we can stop
      if (waveSources.length > 0 && waveSources.every(sid => seeds[sid])) break;
    }

    try {
      console.log(`[Wave] Seeded loading more tracks using seeds:`, seeds);
      const moreTracks = await window.electronAPI.invoke('get-my-wave', { 
        providersList: waveSources,
        seeds: seeds
      });
      
      if (moreTracks && moreTracks.length > 0) {
        // Exclude duplicates
        const existingIds = new Set(vibeTracks.map(t => t.id));
        const uniqueMore = moreTracks.filter((t: any) => !existingIds.has(t.id));
        
        if (uniqueMore.length > 0) {
          const updatedTracks = [...vibeTracks, ...uniqueMore];
          setVibeTracks(updatedTracks);
          addToQueue(uniqueMore);
          console.log(`[MainContent] Added ${uniqueMore.length} more unique tracks to wave`);
        } else {
          console.log('[MainContent] No unique tracks returned from fetch');
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
      console.log(`[MainContent] Loaded ${data.length} playlists for ${activeProviderId}`);
      setPlaylists(data);
      setAuthStatus(newAuthStatus);
    } catch (error) {
      console.error('Failed to load library:', error);
      alert(`Failed to load library: ${error}`);
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

  const loadPlaylistTracks = async (playlist: any) => {
    setActivePlaylist(playlist);
    setIsLoadingTracks(true);
    setVisibleCount(50); // Reset for new playlist

    if (playlist.tracks && Array.isArray(playlist.tracks)) {
      setPlaylistTracks(playlist.tracks);
      setIsLoadingTracks(false);
      return;
    }

    if (!activeProviderId) {
      setIsLoadingTracks(false);
      return;
    }

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

  const handleCategoryClick = (category: string) => {
    let seed = '';
    switch(category) {
      case 'energy': seed = 'category:energy'; break;
      case 'relax': seed = 'category:relax'; break;
      case 'focus': seed = 'category:focus'; break;
      case 'party': seed = 'category:party'; break;
    }
    
    if (seed) {
      console.log(`[MainContent] Starting category wave for: ${category} (seed: ${seed}) with sources:`, providers.filter(p => authStatus[p.id]).map(p => p.id));
      // Start wave with the category seed
      
      setVibeLoading(true);
      setActivePlaylist(null);
      setActiveView('wave');
      setVibeTracks([]);
      
      const activeSources = providers.filter(p => authStatus[p.id]).map(p => p.id);
      const sourcesToUse = waveSources.length > 0 ? waveSources : activeSources;
      
      const categorySeeds: Record<string, string> = {};
      sourcesToUse.forEach(sid => {
        categorySeeds[sid] = seed;
      });

      window.electronAPI.invoke('get-my-wave', { 
        providersList: sourcesToUse, 
        seeds: categorySeeds 
      }).then(tracks => {
        setVibeTracks(tracks);
        if (tracks.length > 0) {
          setQueue(tracks);
          handlePlay(tracks[0], tracks);
        }
      }).catch(e => {
        console.error('[MainContent] Category wave failed', e);
      }).finally(() => {
        setVibeLoading(false);
      });
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
    // Trigger Achievement
    achievementStore.unlock('first-wave');

    setVibeLoading(true);
    setActivePlaylist(null);
    setActiveView('wave');
    setVibeTracks([]);
    setShowPlaylistMenu(null);
    
    try {
      const activeSources = providers.filter(p => authStatus[p.id]).map(p => p.id);
      const sourcesToUse = waveSources.length > 0 ? waveSources : activeSources;
      
      const tracks = seedTrack 
        ? await window.electronAPI.invoke('get-track-radio', { providerId: seedTrack.provider, trackId: seedTrack.id })
        : (console.log('[Wave] Initializing wave with sources:', sourcesToUse), await window.electronAPI.invoke('get-my-wave', { providersList: sourcesToUse, seeds: {} }));
        
      setVibeTracks(tracks);
      if (tracks.length > 0) {
        setQueue(tracks);
        const firstTrack = tracks[0];
        
        // PRE-EMPTIVE STORE UPDATE (STRICT EXCLUSION)
        console.log(`[Wave] Pre-emptively setting currentTrack to ID: ${firstTrack.id} (${firstTrack.provider})`);
        setCurrentTrack(firstTrack);

        if (firstTrack.provider === 'spotify') {
          await window.electronAPI.invoke('play-spotify-uri', {
            deviceId: spotifyDeviceId || undefined,
            trackId: firstTrack.id
          });
          
          // Проверка: не изменился ли трек?
          if (usePlayerStore.getState().currentTrack?.id !== firstTrack.id) return;
          
          playTrack(firstTrack);
        } else {
          const streamUrl = await window.electronAPI.invoke('play-track', { 
            providerId: firstTrack.provider, 
            trackId: firstTrack.id 
          });
          
          // Проверка: не изменился ли трек?
          if (usePlayerStore.getState().currentTrack?.id !== firstTrack.id) return;

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
      setVibeLoading(false);
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

  const createNewLocalPlaylist = async (title: string, track?: Track) => {
    try {
      const id = `local-${Date.now()}`;
      const newPlaylist: LocalPlaylist = {
        id,
        title,
        tracks: track ? [track] : []
      };
      await window.electronAPI.invoke('save-local-playlist', { playlist: newPlaylist });
      await loadLocalPlaylists();
      achievementStore.unlock('curator');
      alert(t.content.addedToPlaylist);
    } catch (e) {
      console.error('Failed to create local playlist:', e);
    } finally {
      setShowPlaylistMenu(null);
    }
  };

  const addTrackToLocalPlaylist = async (playlistId: string, track: Track) => {
    try {
      await window.electronAPI.invoke('add-to-local-playlist', { playlistId, track });
      await loadLocalPlaylists();
      alert(t.content.addedToPlaylist);
    } catch (e) {
      console.error('Failed to add to local playlist:', e);
    } finally {
      setShowPlaylistMenu(null);
    }
  };

  const deleteLocalPlaylist = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this collection?')) {
      try {
        await window.electronAPI.invoke('delete-local-playlist', { id });
        await loadLocalPlaylists();
      } catch (e) {
        console.error('Failed to delete playlist:', e);
      }
    }
  };

  const handleLike = async (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    const isLiked = likedTracks.has(track.id);
    
    // Оптимистичное обновление: сразу меняем состояние лайка и добавляем/удаляем из списка
    toggleLike(track.id);
    
    if (!isLiked) {
      // Если лайкаем — добавляем в начало списка
      setLikedSongs(prev => [track, ...prev]);
    } else {
      // Если убираем лайк — удаляем из списка
      setLikedSongs(prev => prev.filter(t => t.id !== track.id));
    }

    try {
      const success = await window.electronAPI.invoke('like-track', {
        providerId: track.provider,
        trackId: track.id,
        like: !isLiked
      });

      if (!success) {
        // Откат при неудаче
        toggleLike(track.id);
        loadLikedSongs(); // Перезагружаем "правдивый" список
      }
    } catch (error) {
      console.error('Like action failed:', error);
      toggleLike(track.id);
      loadLikedSongs();
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
        alert(`Search failed: ${error}`);
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

    // Stop all active audio engines (Native, Worker, etc)
    const { hardStopAll, setLastRequestId } = usePlayerStore.getState();
    const requestId = Math.random().toString(36).substring(7);
    setLastRequestId(requestId);
    
    await hardStopAll();

    try {
      // PRE-EMPTIVE STORE UPDATE (STRICT EXCLUSION)
      // We set the current track immediately so the other provider (e.g. Spotify -> Yandex switch)
      // will see the provider change and PAUSE IMMEDIATELY via its useEffect.
      console.log(`[MainContent] Pre-emptively setting currentTrack to ID: ${track.id} (${track.provider})`);
      setCurrentTrack(track);
      
      if (tracksContext.length > 0) {
        setQueue(tracksContext);
      }
      
      if (track.provider === 'spotify') {
        // Мы НЕ вызываем play-spotify-uri здесь напрямую, 
        // потому что он уже будет вызван внутри playTrack().
        // Это предотвращает двойной запуск.
        playTrack(track); 
      } else {
        const streamUrl = await window.electronAPI.invoke('play-track', { 
          providerId: track.provider, 
          trackId: track.id 
        });

        // RACE CONDITION CHECK
        if (usePlayerStore.getState().lastRequestId !== requestId) {
          console.log('[MainContent] Play-track ignored: newer request exists');
          return;
        }
        
        // Проверка: что если за это время пользователь кликнул другой трек?
        if (usePlayerStore.getState().currentTrack?.id !== track.id) {
          console.log('[MainContent] Native play aborted: track changed during stream fetch');
          return;
        }
        
        if (streamUrl) {
          playTrack({ ...track, streamUrl });
        }
      }
    } catch (error) {
      console.error('Failed to play track:', error);
      alert(error);
    }
  };

  const filteredLiked = likedSongs.filter(track => 
    likedFilter === 'all' ? true : track.provider === likedFilter
  );

  const handleAvatarClick = async () => {
    console.log('[MainContent] Avatar click triggered. Invoking select-avatar-file...');
    try {
      const dataUrl = await window.electronAPI.invoke('select-avatar-file');
      console.log('[MainContent] select-avatar-file returned:', dataUrl ? 'DataURL received' : 'Null/Canceled');
      if (dataUrl) {
        setAvatarUrl(dataUrl);
      }
    } catch (e) {
      console.error('[MainContent] select-avatar-file IPC failed:', e);
    }
  };

  // Reset infinite scroll count when filter or view changes
  useEffect(() => {
    setVisibleCount(50);
  }, [likedFilter, activeView]);

  const handleShare = (type: 'track' | 'playlist', data: any) => {
    try {
      // Унификация ID: убираем контекст альбома (актуально для Yandex и др.), 
      // чтобы у разных людей для одной и той же песни генерировался ОДИНАКОВЫЙ код.
      const normalizedId = data.id.includes(':') 
        ? data.id.split(':')[0] 
        : data.id;

      const shareData: any = {
        t: type === 'track' ? 't' : 'p',
        p: data.provider || 'local',
        id: normalizedId,
        n: data.title || data.name,
      };

      if (type === 'track') {
        shareData.a = data.artist;
        shareData.d = data.durationMs;
      } else if (data.tracks && Array.isArray(data.tracks)) {
        // Для плейлистов (особенно локальных) пакуем список треков
        shareData.ts = data.tracks.map((t: any) => ({
          id: t.id,
          p: t.provider,
          n: t.title,
          a: t.artist,
          d: t.durationMs
        }));
      }

      // Base64 with Unicode support
      const json = JSON.stringify(shareData);
      const code = `NEXUS:${btoa(unescape(encodeURIComponent(json)))}`;
      navigator.clipboard.writeText(code);
      
      achievementStore.unlock('social-butterfly');
      showToast(type === 'track' ? 'Код трека скопирован!' : 'Код плейлиста скопирован!');
    } catch (e) {
      console.error('Sharing failed:', e);
      showToast('Ошибка при генерации кода');
    }
  };

  const [importCode, setImportCode] = useState('');
  const [importData, setImportData] = useState<any>(null);
  const [isImportLoading, setIsImportLoading] = useState(false);

  const handleProcessImportCode = async () => {
    if (!importCode.trim() || !importCode.startsWith('NEXUS:')) {
      showToast('Неверный формат кода!');
      return;
    }
    
    setIsImportLoading(true);
    try {
      const base64 = importCode.replace('NEXUS:', '');
      const json = decodeURIComponent(escape(atob(base64)));
      const data = JSON.parse(json);
      
      console.log('[Import] Parsed data:', data);
      
      if (data.t === 't') {
        const query = `${data.n} ${data.a}`;
        // Сначала пробуем найти по оригинальному провайдеру
        let searchResults = await window.electronAPI.invoke('search', {
          providerId: data.p,
          query,
          page: 1
        });

        // Если не нашли ИЛИ пользователь не залогинен в этот провайдер 
        // (search по конкретному ID может вернуть [], если нет доступа) 
        // — пробуем ГЛОБАЛЬНЫЙ поиск по всем активным провайдерам.
        if (searchResults.length === 0) {
          console.log(`[Import] Track not found on ${data.p}, falling back to GLOBAL search...`);
          searchResults = await window.electronAPI.invoke('search', {
            providerId: 'all',
            query,
            page: 1
          });
        }

        // Пытаемся найти точное совпадение по ID или хотя бы первый результат
        const bestMatch = searchResults.find((r: any) => 
          r.id === data.id || r.id.startsWith(data.id) || (r.title === data.n && r.artist === data.a)
        ) || searchResults[0];

        setImportData({
          type: 'track',
          track: bestMatch || {
            id: data.id,
            provider: data.p,
            title: data.n,
            artist: data.a,
            durationMs: data.d || 0,
            coverUrl: null
          }
        });
      } else {
        let fetchedTracks = [];
        if (data.ts && Array.isArray(data.ts)) {
          fetchedTracks = data.ts.map((t: any) => ({
            id: t.id,
            provider: t.p,
            title: t.n,
            artist: t.a,
            durationMs: t.d || 0
          }));
        } else if (data.p && data.p !== 'local') {
          fetchedTracks = await window.electronAPI.invoke('get-playlist-tracks', {
            providerId: data.p,
            playlistId: data.id
          });
        }
        
        setImportData({
          type: 'playlist',
          title: data.n,
          provider: data.p,
          id: data.id,
          tracks: fetchedTracks,
          coverUrl: fetchedTracks[0]?.coverUrl || null
        });
      }

      // CLOSE MODAL AND OPEN PREVIEW VIEW
      setImportModalOpen(false);
      setActiveView('import_preview');
      setImportCode('');
    } catch (e) {
      console.error('Import failed:', e);
      showToast('Не удалось разобрать код');
    } finally {
      setIsImportLoading(false);
    }
  };

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => prev + 50);
        }
      },
      { threshold: 0.1 }
    );

    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) observer.observe(sentinel);

    return () => observer.disconnect();
  }, [activeView, playlistTracks.length, filteredLiked.length, searchResults.length]);

  return (
    <div className="main-content">
      {activeView === 'home' && (
        <div className="home-view">
          <div className="mesh-gradient-bg"></div>
          <div className="tech-grid"></div>
          
          <>
            {/* Hero Section */}
              <div className="home-hero stagger-in">
                <div className="hero-bg">
                  <div className="hero-visual"></div>
                </div>
                <div className="hero-content">
                  <span className="hero-greeting">
                    {(() => {
                      const hour = new Date().getHours();
                      if (hour < 6) return 'Доброй ночи';
                      if (hour < 12) return 'Доброе утро';
                      if (hour < 18) return 'Добрый день';
                      return 'Добрый вечер';
                    })()}, {profileName || 'Путник'}
                  </span>
                  <h1 className="hero-title">Твоя музыка в одном потоке</h1>
                  <button className="hero-btn" onClick={() => handleStartWave()}>
                    <Activity size={20} />
                    Запустить Мою волну
                  </button>
                </div>
              </div>

              {/* News Section */}
              <div className="news-section stagger-in delay-1">
                <div className="news-header">
                  <div className="section-label-row">
                    <Newspaper size={16} />
                    <h2 className="section-label">Новости Nexus</h2>
                  </div>
                </div>
                <div className="news-container">
                  {NEWS_ITEMS.map(item => (
                    <div key={item.id} className="news-card" onClick={() => { setSelectedNews(item); achievementStore.unlock('history-buff'); }}>
                      <div className={`news-card-badge badge-${item.badge.toLowerCase()}`}>{item.badge}</div>
                      <div className="news-card-icon">
                        <item.icon size={20} color="var(--accent-color)" />
                      </div>
                      <div className="news-card-body">
                        <div className="news-card-date">
                          <Clock size={12} />
                          {item.date}
                        </div>
                        <h3 className="news-card-title">{item.title}</h3>
                        <p className="news-card-content">{item.content}</p>
                      </div>
                      <div className="news-card-footer">
                        <span>Читать далее</span>
                        <ArrowRight size={14} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* News Modal */}
              {selectedNews && (
                <div className="news-modal-overlay" onClick={() => setSelectedNews(null)}>
                  <div className="news-modal" onClick={(e) => e.stopPropagation()}>
                    <button className="news-modal-close" onClick={() => setSelectedNews(null)}>
                      <X size={20} />
                    </button>
                    <div className="news-modal-header">
                      <div className="news-modal-badge">{selectedNews.badge}</div>
                      <div className="news-modal-icon-wrap">
                        <selectedNews.icon size={32} color="var(--accent-color)" />
                      </div>
                      <div className="news-modal-title-row">
                        <div className="news-card-date">
                          <Clock size={12} />
                          {selectedNews.date}
                        </div>
                        <h2>{selectedNews.title}</h2>
                      </div>
                    </div>
                    <div className="news-modal-body">
                      <p>{selectedNews.fullContent}</p>
                    </div>
                    <div className="news-modal-footer">
                      <button className="news-modal-btn" onClick={() => setSelectedNews(null)}>
                        Понятно
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Access Section: Unified Source Modules */}
              <div className="section-header stagger-in delay-1">
                <h2 className="section-label">Активные Модули Источников</h2>
              </div>
              
              <div className="source-modules-row stagger-in delay-2">
                {providers.map(p => {
                   const connected = authStatus[p.id];
                   return (
                    <div 
                      key={p.id} 
                      className="source-module-card" 
                      onClick={() => setActiveView('provider', p.id)}
                    >
                      <div className="module-header">
                        <div className="module-icon-large" data-provider={p.id}>
                          {p.id === 'yandex' ? 'Y' : p.id === 'spotify' ? 'S' : p.name[0]}
                        </div>
                        <div className="module-status">
                          <div className={`status-dot ${connected ? 'active' : ''}`}></div>
                          <span>{connected ? 'Nexus Active' : 'Offline'}</span>
                        </div>
                      </div>
                      
                      <div className="module-body">
                        <div className="module-name">{p.name}</div>
                        <div className="module-info">
                          {connected ? 'Все треки синхронизированы' : 'Ожидание авторизации'}
                        </div>
                      </div>

                      <div className="module-footer">
                        <button className="module-action-btn">
                          {connected ? 'Обновить' : 'Подключить'}
                        </button>
                      </div>
                    </div>
                   );
                })}
              </div>

              {/* Local Collections Section */}
              <div className="section-header stagger-in delay-2" style={{ marginTop: '40px' }}>
                <h2 className="section-label">Твои подборки</h2>
              </div>
              <div className="playlist-grid stagger-in delay-2" style={{ marginTop: '16px', marginBottom: '40px' }}>
                {localPlaylists.length > 0 ? (
                  localPlaylists.map(playlist => (
                      <div key={playlist.id} className="playlist-card glass-panel" onClick={() => loadPlaylistTracks(playlist)}>
                        <div className="playlist-cover">
                          <div className="local-playlist-icon" style={{ 
                            width: '100%', 
                            height: '100%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            background: 'linear-gradient(45deg, var(--accent-light), var(--accent-color))',
                            borderRadius: '12px',
                            position: 'relative'
                          }}>
                            <Library size={48} color="white" />
                            <button 
                              className="delete-playlist-btn" 
                              onClick={(e) => deleteLocalPlaylist(playlist.id, e)}
                              title="Delete collection"
                            >
                              <Trash2 size={14} />
                            </button>
                            <button 
                              className="share-playlist-btn" 
                              onClick={(e) => { e.stopPropagation(); handleShare('playlist', playlist); }}
                              title="Share collection"
                            >
                              <Share size={14} />
                            </button>
                          </div>
                        </div>
                      <div className="playlist-info">
                        <div className="playlist-title">{playlist.title}</div>
                        <div className="playlist-tracks">{playlist.tracks.length} треков • Unified</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state glass-panel" style={{ padding: '60px 20px', textAlign: 'center', width: '100%', gridColumn: '1 / -1' }}>
                    <Library size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>У тебя пока нет локальных подборок.<br/>Создавай их из любимых треков или миксов!</p>
                  </div>
                )}
              </div>

              {/* Discovery Section */}
              <div className="section-header stagger-in delay-3">
                <h2 className="section-label">Продолжить прослушивание</h2>
              </div>
              
              <div className="mixes-grid stagger-in delay-4">
                <div className="mix-card" onClick={() => setActiveView('liked')}>
                  <div className="mix-cover" style={{ backgroundColor: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Heart size={64} color="var(--accent-color)" opacity={0.3} fill="var(--accent-color)" />
                  </div>
                  <div className="mix-title">Любимые треки</div>
                  <div className="mix-subtitle">{likedTracks.size} треков</div>
                </div>
                <div className="mix-card">
                  <div className="mix-cover" style={{ backgroundImage: 'linear-gradient(135deg, #333, #111)' }}></div>
                  <div className="mix-title">Недавний микс</div>
                  <div className="mix-subtitle">Обновлено 2ч назад</div>
                </div>
              </div>

              {/* Moods Section */}
              <div className="section-header stagger-in delay-5">
                <h2 className="section-label">Категории</h2>
              </div>
              <div className="category-grid stagger-in delay-6">
                <div className="category-card" style={{ background: 'linear-gradient(45deg, #ff416c, #ff4b2b)' }} onClick={() => handleCategoryClick('energy')}>
                  <span>ЭНЕРГИЯ</span>
                </div>
                <div className="category-card" style={{ background: 'linear-gradient(45deg, #4facfe, #00f2fe)' }} onClick={() => handleCategoryClick('relax')}>
                  <span>РЕЛАКС</span>
                </div>
                <div className="category-card" style={{ background: 'linear-gradient(45deg, #00b09b, #96c93d)' }} onClick={() => handleCategoryClick('focus')}>
                  <span>ФОКУС</span>
                </div>
                <div className="category-card" style={{ background: 'linear-gradient(45deg, #f093fb, #f5576c)' }} onClick={() => handleCategoryClick('party')}>
                  <span>ВЕЧЕРИНКА</span>
                </div>
              </div>
            </>
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
            <button 
              className={`category-tab ${searchSource === 'youtube' ? 'active' : ''}`}
              data-provider="youtube"
              onClick={() => setSearchSource('youtube')}
            >
              YouTube Music
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
                    key={`${track.provider}:${track.id}`} 
                    className={`track-item ${showPlaylistMenu === `${track.provider}:${track.id}` ? 'active-menu' : ''} ${currentTrack?.id === track.id ? 'active' : ''}`} 
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
                      <div className="marquee-container">
                        <div className="track-title">{track.title}</div>
                      </div>
                      <div className="marquee-container">
                        <div className="track-artist">{track.artist}</div>
                      </div>
                    </div>
                    <div className="track-actions">
                      <button 
                        className={`nexus-like-toggle ${likedTracks.has(track.id) ? 'active' : ''}`}
                        onClick={(e) => handleLike(e, track)}
                      >
                        {likedTracks.has(track.id) ? <Minus size={18} /> : <Plus size={18} />}
                      </button>
                      <div className="menu-container">
                        <button 
                          className="action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            const trackKey = `${track.provider}:${track.id}`;
                            const isOpening = showPlaylistMenu !== trackKey;
                            setShowPlaylistMenu(isOpening ? trackKey : null);
                            
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
                        {showPlaylistMenu === `${track.provider}:${track.id}` && (
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
                                  <div 
                                    className="menu-item highlight"
                                    onClick={(e) => { e.stopPropagation(); handleShare('track', track); setShowPlaylistMenu(null); }}
                                  >
                                    <Share size={14} style={{ marginRight: '8px' }} />
                                    Поделиться
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
        <div className="profile-view stagger-in">
          <div className="profile-nav">
            <div 
              className={`profile-nav-item ${profileTab === 'overview' ? 'active' : ''}`}
              onClick={() => setProfileTab('overview')}
            >
              Identity
            </div>
            <div 
              className={`profile-nav-item ${profileTab === 'achievements' ? 'active' : ''}`}
              onClick={() => setProfileTab('achievements')}
            >
              Honors
            </div>
          </div>

          <div className="tab-content-faded">
            {profileTab === 'overview' ? (
              <div className="overview-tab">
                <div className="profile-hero premium-view">
                  <div className="mesh-gradient-bg"></div>
                  <div className="tech-grid"></div>
                  <div className="profile-avatar-large" onClick={handleAvatarClick} style={{ cursor: 'pointer', overflow: 'hidden' }}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <User size={80} color="var(--accent-color)" />
                    )}
                    <div className="avatar-edit-overlay">
                      <Plus size={24} color="white" />
                    </div>
                  </div>
                  <div className="profile-info-large">
                    <div className="premium-badge">Nexus Prime Member</div>
                    <h1>Твоя Личность</h1>
                    <div className="profile-meta">
                      <span className="user-nickname">
                        {Object.entries(authStatus).find(([id, connected]) => connected && id === 'spotify') ? 'Spotify Enthusiast' : 
                         Object.entries(authStatus).find(([id, connected]) => connected && id === 'yandex') ? 'Yandex Voyager' : 'Nexus Nomad'}
                      </span>
                      <span className="status-dot-active">Active Protocol</span>
                    </div>
                  </div>
                </div>

                <div className="profile-stats grid-2 mt-4">
                  <div className="stat-card hud-box" onClick={() => setActiveView('liked')}>
                    <div className="stat-info">
                      <span className="stat-label">Любимых треков: </span>
                      <span className="stat-value">{likedTracks.size}</span>
                    </div>
                    <Heart size={32} color="#ff3366" opacity={0.3} fill="#ff3366" />
                  </div>
                  <div className="stat-card hud-box">
                    <div className="stat-info">
                      <span className="stat-label">Подключено сервисов: </span>
                      <span className="stat-value">{Object.values(authStatus).filter(Boolean).length} / {providers.length}</span>
                    </div>
                    <Activity size={32} color="var(--accent-color)" opacity={0.3} />
                  </div>
                </div>

                <div className="section-header mt-4">
                  <h2 className="section-label">Связанные протоколы</h2>
                </div>

                <div className="service-cards-grid">
                  {providers.filter(p => p.id === 'yandex' || p.id === 'spotify').map((p) => {
                    const connected = authStatus[p.id];
                    return (
                      <div key={p.id} className="service-card-premium" data-provider={p.id}>
                        <div className="service-icon-large">
                          {p.id === 'yandex' ? 'Y' : 'S'}
                        </div>
                        <div className="service-info-premium">
                          <h3>{p.name}</h3>
                          <div className={`service-status-pill ${connected ? 'status-online' : 'status-offline'}`}>
                            {connected ? 'Protocol Online' : 'Offline'}
                          </div>
                        </div>
                        <div className="service-actions-premium">
                          <button className="icon-btn-small" onClick={handleAuth} title="Re-auth">
                            <Activity size={16} />
                          </button>
                          {connected && (
                            <button className="icon-btn-small logout-btn-icon" onClick={() => window.electronAPI.invoke('logout', p.id)} title="Disconnect">
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="achievements-tab achievements-container">
                <div className="section-header">
                   <h2 className="section-label">Достижения Nexus</h2>
                </div>
                <div className="achievements-grid mt-4">
                  {ACHIEVEMENTS.map(ach => {
                    const active = achievementStore.isUnlocked(ach.id) || ['music-lover', 'nexus-pioneer', 'daft-punk'].includes(ach.id); // Placeholder logic for legacy
                    return (
                      <div key={ach.id} className={`achievement-tile ${active ? 'active' : 'locked'}`}>
                        <div className="achievement-tile-icon">
                          <ach.icon size={24} />
                        </div>
                        <div className="achievement-tile-content">
                          <div className="achievement-tile-title">{ach.title}</div>
                          <div className="achievement-tile-description">
                            {ach.description} {!active && '(Заблокировано)'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {activeView === 'local_playlists' && (
        <div className="local-playlists-view provider-view">
          {activePlaylist ? (
            <div className="playlist-detail-view">
              <button className="back-btn" onClick={() => setActivePlaylist(null)}>
                <ChevronLeft size={20} /> {t.content.backToLibrary}
              </button>
              
              <div className="playlist-header-large">
                <div className="playlist-cover-large" style={{ 
                  background: 'linear-gradient(45deg, var(--accent-light), var(--accent-color))',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <Library size={80} color="white" />
                </div>
                <div className="playlist-info-large">
                  <span className="label">{t.content.playlist}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h1>{activePlaylist.title}</h1>
                    <button 
                      className="share-playlist-btn-inline" 
                      style={{ 
                        opacity: 0.6, 
                        background: 'none', 
                        border: 'none', 
                        color: 'white', 
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                      onClick={() => handleShare('playlist', activePlaylist)}
                    >
                      <Share size={20} />
                    </button>
                  </div>
                  <p>{activePlaylist.tracks?.length || 0} {t.content.tracksCount} • Unified</p>
                </div>
              </div>

              <div className="track-list">
                {isLoadingTracks ? (
                  <p className="loading-text">{t.content.loadingTracks}</p>
                ) : playlistTracks.length > 0 ? (
                  <>
                    {playlistTracks.slice(0, visibleCount).map((track, index) => (
                      <div 
                        key={`${track.provider}:${track.id}:${index}`} 
                        className={`track-item ${showPlaylistMenu === `${track.provider}:${track.id}` ? 'active-menu' : ''} ${currentTrack?.id === track.id ? 'active' : ''}`} 
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
                            className={`nexus-like-toggle ${likedTracks.has(track.id) ? 'active' : ''}`}
                            onClick={(e) => handleLike(e, track)}
                          >
                            {likedTracks.has(track.id) ? <Minus size={18} /> : <Plus size={18} />}
                          </button>
                          <div className="menu-container">
                            <button 
                              className="action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                const trackKey = `${track.provider}:${track.id}`;
                                const isOpening = showPlaylistMenu !== trackKey;
                                setShowPlaylistMenu(isOpening ? trackKey : null);
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
                          </div>
                        </div>
                        <div className="track-provider">{track.provider}</div>
                        <div className="track-duration">{Math.floor(track.durationMs / 60000)}:{String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}</div>
                      </div>
                    ))}
                    {playlistTracks.length > visibleCount && <div id="scroll-sentinel" style={{ height: '20px' }} />}
                  </>
                ) : (
                  <p className="loading-text">{t.content.emptyPlaylist}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="local-playlists-grid stagger-in">
              <div className="provider-header">
                <h1>{t.sidebar?.playlists || 'Плейлисты'}</h1>
                <p style={{ opacity: 0.6 }}>Твои единые коллекции музыки</p>
              </div>

              <div className="playlist-grid mt-4">
                {localPlaylists.length > 0 ? (
                  localPlaylists.map(playlist => (
                    <div key={playlist.id} className="playlist-card glass-panel" onClick={() => loadPlaylistTracks(playlist)}>
                      <div className="playlist-cover">
                        <div className="local-playlist-icon" style={{ 
                          width: '100%', 
                          height: '100%', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          background: 'linear-gradient(45deg, var(--accent-light), var(--accent-color))',
                          borderRadius: '12px',
                          position: 'relative'
                        }}>
                          <Library size={48} color="white" />
                          <button 
                            className="delete-playlist-btn" 
                            onClick={(e) => deleteLocalPlaylist(playlist.id, e)}
                            title="Delete collection"
                          >
                            <Trash2 size={14} />
                          </button>
                          <button 
                            className="share-playlist-btn" 
                            onClick={(e) => { e.stopPropagation(); handleShare('playlist', playlist); }}
                            title="Share collection"
                          >
                            <Share size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="playlist-info">
                        <div className="playlist-title">{playlist.title}</div>
                        <div className="playlist-tracks">{playlist.tracks.length} треков • Unified</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state glass-panel" style={{ padding: '60px 20px', textAlign: 'center', width: '100%', gridColumn: '1 / -1' }}>
                    <Library size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>У тебя пока нет локальных подборок.<br/>Создавай их из любимых треков или миксов!</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeView === 'import_preview' && importData && (
        <div className="import-preview-view provider-view fade-in">
          <div className="provider-header">
            <button className="back-btn" style={{ marginBottom: '16px' }} onClick={() => setActiveView('home')}>
              <ChevronLeft size={20} /> {t.content.backToLibrary}
            </button>
            <h1>{t.content.importPreview || 'ПРЕВЬЮ ИМПОРТА'}</h1>
          </div>
          
          <div className="playlist-header-large mt-4">
            <div className="playlist-cover-large" style={{ 
              background: 'linear-gradient(45deg, #7000ff, #00f2ff)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: '0 20px 50px rgba(0, 242, 255, 0.2)'
            }}>
              {importData.coverUrl ? (
                <img src={importData.coverUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              ) : (
                <Library size={80} color="white" />
              )}
            </div>
            <div className="playlist-info-large">
              <span className="label">{importData.type.toUpperCase()} // EXTERNAL IMPORT</span>
              <h1>{importData.type === 'track' ? importData.track.title : importData.title}</h1>
              <p>{importData.type === 'track' ? 1 : importData.tracks?.length || 0} {t.content.tracksCount} • {importData.provider?.toUpperCase() || 'EXTERNAL'}</p>
              
              <div className="import-actions-row" style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
                <button 
                  className="nexus-btn primary glow-on-hover"
                  onClick={() => {
                    if (importData.type === 'track') {
                      createNewLocalPlaylist(importData.track.title, importData.track);
                    } else {
                      const id = `local-${Date.now()}`;
                      const newPlaylist: LocalPlaylist = {
                        id,
                        title: importData.title,
                        tracks: importData.tracks
                      };
                      window.electronAPI.invoke('save-local-playlist', { playlist: newPlaylist }).then(() => {
                        loadLocalPlaylists();
                        setActiveView('local_playlists');
                        showToast(t.content.addedToPlaylist);
                      });
                    }
                  }}
                >
                  {t.content.importAll || 'ИМПОРТИРОВАТЬ ВСЁ'}
                </button>
                <button 
                  className="nexus-btn secondary"
                  onClick={() => setActiveView('home')}
                >
                  ОТМЕНА
                </button>
              </div>
            </div>
          </div>

          <div className="track-list mt-4">
            {(importData.type === 'track' ? [importData.track] : importData.tracks || []).map((track: any, index: number) => (
              <div 
                key={`${track.provider}:${track.id}:${index}`} 
                className={`track-item ${showPlaylistMenu === `${track.provider}:${track.id}` ? 'active-menu' : ''} ${currentTrack?.id === track.id ? 'active' : ''}`} 
                onClick={() => handlePlay(track, importData.type === 'playlist' ? importData.tracks : [])}
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
                    className={`nexus-like-toggle ${likedTracks.has(track.id) ? 'active' : ''}`}
                    title={likedTracks.has(track.id) ? "Убрать из избранного" : "В избранное"}
                    onClick={(e) => {
                      e.stopPropagation();
                      const isLiked = likedTracks.has(track.id);
                      handleLike(e, track);
                      
                      // Синхронизация с плейлистом Imported
                      const importedPlaylist = localPlaylists.find(p => p.title === 'Imported');
                      if (!isLiked) {
                        // Если лайкаем — добавляем
                        if (importedPlaylist) {
                          addTrackToLocalPlaylist(importedPlaylist.id, track);
                        } else {
                          createNewLocalPlaylist('Imported', track);
                        }
                      } else if (importedPlaylist) {
                        // Если убираем лайк — удаляем из Imported
                        const updatedTracks = importedPlaylist.tracks.filter(t => t.id !== track.id);
                        window.electronAPI.invoke('save-local-playlist', { 
                          playlist: { ...importedPlaylist, tracks: updatedTracks } 
                        }).then(loadLocalPlaylists);
                      }
                    }}
                  >
                    {likedTracks.has(track.id) ? <Minus size={18} /> : <Plus size={18} />}
                  </button>
                </div>
                <div className="track-provider">{track.provider}</div>
              </div>
            ))}
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
              <>
                {filteredLiked.slice(0, visibleCount).map((track, index) => (
                  <div 
                    key={`${track.provider}:${track.id}`} 
                    className={`track-item ${showPlaylistMenu === `${track.provider}:${track.id}` ? 'active-menu' : ''} ${currentTrack?.id === track.id ? 'active' : ''}`} 
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
                        className={`nexus-like-toggle ${likedTracks.has(track.id) ? 'active' : ''}`}
                        onClick={(e) => handleLike(e, track)}
                      >
                        {likedTracks.has(track.id) ? <Minus size={18} /> : <Plus size={18} />}
                      </button>
                      <div className="menu-container">
                        <button 
                          className="action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            const trackKey = `${track.provider}:${track.id}`;
                            setShowPlaylistMenu(showPlaylistMenu === trackKey ? null : trackKey);
                            // Fetch playlists if not available or for correct provider
                            if (playlists.length === 0 || activeProviderId !== track.provider) {
                              window.electronAPI.invoke('get-playlists', track.provider).then(setPlaylists);
                            }
                          }}
                        >
                          <MoreVertical size={18} />
                        </button>
                        {showPlaylistMenu === `${track.provider}:${track.id}` && (
                          <div className={`playlist-mini-menu ${index > filteredLiked.length - 4 ? 'upward' : ''}`}>
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
                                    <div 
                                      className="menu-item highlight"
                                      onClick={(e) => { e.stopPropagation(); handleShare('track', track); setShowPlaylistMenu(null); }}
                                    >
                                      <Share size={14} style={{ marginRight: '8px' }} />
                                      Поделиться
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
                ))}
                {filteredLiked.length > visibleCount && <div id="scroll-sentinel" style={{ height: '20px' }} />}
              </>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h1>{activePlaylist.title}</h1>
                    <button 
                      className="icon-btn glass-panel" 
                      onClick={() => handleShare('playlist', activePlaylist)}
                      title="Share playlist"
                      style={{ padding: '8px' }}
                    >
                      <Share size={18} />
                    </button>
                  </div>
                  <p>{activePlaylist.trackCount} {t.content.tracksCount}</p>
                </div>
              </div>

              <div className="track-list">
                {isLoadingTracks ? (
                  <p className="loading-text">{t.content.loadingTracks}</p>
                ) : playlistTracks.length > 0 ? (
                  <>
                    {playlistTracks.slice(0, visibleCount).map((track, index) => (
                      <div 
                        key={`${track.provider}:${track.id}`} 
                        className={`track-item ${showPlaylistMenu === `${track.provider}:${track.id}` ? 'active-menu' : ''} ${currentTrack?.id === track.id ? 'active' : ''}`} 
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
                            className={`nexus-like-toggle ${likedTracks.has(track.id) ? 'active' : ''}`}
                            onClick={(e) => handleLike(e, track)}
                          >
                            {likedTracks.has(track.id) ? <Minus size={18} /> : <Plus size={18} />}
                          </button>
                          <div className="menu-container">
                            <button 
                              className="action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                const trackKey = `${track.provider}:${track.id}`;
                                const isOpening = showPlaylistMenu !== trackKey;
                                setShowPlaylistMenu(isOpening ? trackKey : null);
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
                            {showPlaylistMenu === `${track.provider}:${track.id}` && (
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
                                        <div 
                                          className="menu-item highlight"
                                          onClick={(e) => { e.stopPropagation(); handleShare('track', track); setShowPlaylistMenu(null); }}
                                        >
                                          <Share size={14} style={{ marginRight: '8px' }} />
                                          Поделиться
                                        </div>
                                      {/* Local Playlists */}
                                      <div className="menu-divider" style={{ margin: '8px 0', borderTop: '1px solid var(--glass-border)' }} />
                                      <div className="menu-header" style={{ padding: '4px 8px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Local Playlists</div>
                                      <div 
                                        className="menu-item highlight"
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          showPrompt({
                                            title: t.content.newPlaylistName,
                                            placeholder: t.content.playlistName,
                                            onConfirm: (title) => {
                                              if (title) createNewLocalPlaylist(title, track);
                                            }
                                          });
                                          setShowPlaylistMenu(null);
                                        }}
                                      >
                                        <Plus size={14} style={{ marginRight: '8px' }} />
                                        Create New Local
                                      </div>
                                      {localPlaylists.map(p => (
                                        <div 
                                          key={p.id} 
                                          className="menu-item"
                                          onClick={(e) => { e.stopPropagation(); addTrackToLocalPlaylist(p.id, track); }}
                                        >
                                          {p.title}
                                        </div>
                                      ))}
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
                    ))}
                    {playlistTracks.length > visibleCount && <div id="scroll-sentinel" style={{ height: '20px' }} />}
                  </>
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
                          <button 
                            className="share-playlist-btn" 
                            onClick={(e) => { e.stopPropagation(); handleShare('playlist', playlist); }}
                            title="Share playlist"
                            style={{ opacity: 1, position: 'absolute', top: '12px', right: '12px' }}
                          >
                            <Share size={14} />
                          </button>
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
        <div className="playlist-detail-view wave-view stagger-in">
          <div className="playlist-header-large" style={{ position: 'relative' }}>
            <div className={`playlist-cover-large wave-cover glass-panel ${isPlaying ? 'vibe-playing' : ''}`}>
               <div className="vibe-core">
                  <div className="vibe-ring ring-1"></div>
                  <div className="vibe-ring ring-2"></div>
                  <div className="vibe-ring ring-3"></div>
                  <div className="vibe-center">
                    {(isPlaying && vibeGifMode !== 'off') ? (
                      <img src={currentVibeGif} className="vibe-gif" alt="" />
                    ) : (
                      <Zap size={48} className="vibe-icon" />
                    )}
                  </div>
                  <div className="vibe-particles"></div>
               </div>
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
            {isVibeLoading ? (
              <p className="loading-text">Настраиваем вашу волну...</p>
            ) : vibeTracks.length > 0 ? (
              vibeTracks.map((track, index) => (
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
                      className={`nexus-like-toggle ${likedTracks.has(track.id) ? 'active' : ''}`}
                      onClick={(e) => handleLike(e, track)}
                    >
                      {likedTracks.has(track.id) ? <Minus size={18} /> : <Plus size={18} />}
                    </button>
                    <div className="menu-container">
                      <button 
                        className="action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          const trackKey = track.id; // Wave tracks might have composite IDs but track.id is unique enough here
                          const isOpening = showPlaylistMenu !== trackKey;
                          setShowPlaylistMenu(isOpening ? trackKey : null);
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
                        <div className={`playlist-mini-menu ${index > vibeTracks.length - 4 ? 'upward' : ''}`}>
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
                                    onClick={(e) => { e.stopPropagation(); handleShare('track', track); setShowPlaylistMenu(null); }}
                                  >
                                    <Share size={14} style={{ marginRight: '8px' }} />
                                    Поделиться
                                  </div>
                                {playlists.map(p => (
                                  <div 
                                    key={p.id} 
                                    className="menu-item"
                                    onClick={(e) => { e.stopPropagation(); handleAddToPlaylist(p.id, track); }}
                                  >
                                    {p.title}
                                  </div>
                                ))}
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

          <button className="focus-back-btn" onClick={() => setActiveView(previousView || 'home', previousProviderId)}>
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
                <div className={`mini-cover-wrapper focus-wrapper-large ${isPlaying ? 'playing' : ''} ${(!currentTrack.coverUrl || imgError) ? 'fallback-mode' : ''}`}>
                  <img 
                    key={`${currentTrack.id}-${imgError}`}
                    src={(!currentTrack.coverUrl || imgError) ? getFallbackGif() : currentTrack.coverUrl} 
                    className="mini-cover" 
                    alt="" 
                    onError={() => {
                      if (!imgError) setImgError(true);
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
      
      {isImportModalOpen && (
        <div className="import-modal-overlay" onClick={() => setImportModalOpen(false)}>
          <div className="import-modal-card premium-glass" onClick={e => e.stopPropagation()}>
            <div className="import-modal-header">
              <h2 className="premium-font">{t.sidebar?.import || 'ИМПОРТ ПО КОДУ'}</h2>
              <button className="import-modal-close" onClick={() => setImportModalOpen(false)}>
                <X size={24} />
              </button>
            </div>
            
            <div className="import-modal-body">
              <div className="import-input-section">
                <label className="import-label">{t.content?.enterCode || 'Вставьте полученный код:'}</label>
                <div className="import-field-group">
                  <input 
                    type="text" 
                    className="import-input-nexus" 
                    placeholder="NEXUS:..."
                    value={importCode}
                    onChange={(e) => setImportCode(e.target.value)}
                  />
                  <button 
                    className="import-parse-btn"
                    onClick={handleProcessImportCode}
                    disabled={isImportLoading}
                  >
                    {isImportLoading ? <div className="spinner-tiny" /> : 'РАЗБРАТЬ'}
                  </button>
                </div>
              </div>
            </div>

            <div className="import-modal-footer">
              <button className="nexus-btn secondary" style={{ width: '100%' }} onClick={() => setImportModalOpen(false)}>ОТМЕНА</button>
            </div>
          </div>
        </div>
      )}

      {usePlayerStore((state) => state.isLoadingTrack) && (
        <div className="global-track-loader">
          <div className="spinner-small" />
          <span>Загрузка...</span>
        </div>
      )}
    </div>
  );
};
