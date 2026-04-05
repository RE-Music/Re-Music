import { useRef, useEffect, useState } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, 
  Maximize2, Repeat, Shuffle, MoreVertical, SlidersHorizontal,
  Plus, Minus, Library, Music, Mic2, Share2
} from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useAppStore } from '../../store/useAppStore';
import type { LocalPlaylist } from '../../store/useAppStore';
import { useEqStore } from '../../store/useEqStore';
import { ensureCtxRunning } from '../../hooks/useAudioEngine';
import { getTranslation } from '../../utils/i18n';
import type { Track } from '../../../shared/interfaces/IMusicProvider';

import { SoundSettingsModal } from '../modals/SoundSettingsModal';

export const PlayerBar = () => {
  const [isSoundSettingsOpen, setIsSoundSettingsOpen] = useState(false);

  const { 
    currentTrack, isPlaying, volume, togglePlayPause, setVolume, setProgress, 
    nextTrack, prevTrack, progressMs, durationMs, setDurationMs,
    isShuffle, toggleShuffle, repeatMode, toggleRepeat, isMuted, toggleMute,
    spotifyPlayer, isLyricsOpen, setLyricsOpen, fetchLyrics
  } = usePlayerStore();
  const { 
    likedTracks, toggleLike, language, activeView, setActiveView,
    localPlaylists, loadLocalPlaylists, showPrompt, showToast,
    previousView, previousProviderId, setPosterModalOpen
  } = useAppStore();
  const { isEnabled: isEqEnabled } = useEqStore();
  const t = getTranslation(language);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playlistMenuRef = useRef<HTMLDivElement>(null);

  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [isPlaylistsLoading, setIsPlaylistsLoading] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showPlaylistMenu && playlistMenuRef.current && !playlistMenuRef.current.contains(e.target as Node)) {
        setShowPlaylistMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPlaylistMenu]);

  // Playback Synchronization
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const currentProvider = (currentTrack as Track | null)?.provider;
    
    // Если играет Spotify, нативный движок должен молчать (уже обработано в hardStopAll)
    if (currentProvider === 'spotify') return;

    if (isPlaying && currentTrack?.streamUrl) {
      const playbackId = currentTrack.id;
      const targetUrl = currentTrack.streamUrl;
      
      // console.log(`[PlayerBar] Attempting playback: ${currentTrack.title} (${currentTrack.id})`); // Removed console.log
      
      ensureCtxRunning().then(() => {
        // Race condition check
        const state = usePlayerStore.getState();
        if (state.currentTrack?.id !== playbackId || !state.isPlaying) return;

        if (audio.src !== targetUrl) {
          console.log(`[PlayerBar] Setting audio.src to ${targetUrl.substring(0, 50)}...`);
          audio.src = targetUrl;
        }
        
        console.log(`[PlayerBar] Calling audio.play() for ${playbackId}`);
        audio.play().then(() => {
          console.log(`[PlayerBar] audio.play() SUCCESS for ${playbackId}`);
        }).catch(err => {
          if (err.name !== 'AbortError') {
            console.error('[PlayerBar] audio.play() ERROR:', err);
            // Если ошибка серьезная, сбрасываем состояние
            // setIsPlaying(false); 
          } else {
            console.log(`[PlayerBar] audio.play() aborted for ${playbackId}`);
          }
        });
      });
    } else {
      if (!audio.paused) audio.pause();
    }
  }, [isPlaying, currentTrack?.id, currentTrack?.streamUrl]);

  // Синхронизация громкости и Mute
  useEffect(() => {
    if (audioRef.current) {
      // Use squared scale for more natural volume control (logarithmic-like)
      audioRef.current.volume = volume * volume;
      audioRef.current.muted = isMuted;
    }
    if (spotifyPlayer) {
      spotifyPlayer.setVolume(isMuted ? 0 : volume * volume);
    }
  }, [volume, isMuted, spotifyPlayer, currentTrack?.id]);

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime * 1000);
    }
  };

  const onDurationChange = () => {
    if (audioRef.current && currentTrack && currentTrack.provider !== 'spotify') {
      const dur = Math.round(audioRef.current.duration * 1000);
      if (dur > 0 && Math.abs(dur - durationMs) > 1000) {
        console.log(`[PlayerBar] Correcting duration for ${currentTrack.id}: ${durationMs} -> ${dur}`);
        setDurationMs(dur);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentTrack) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const duration = durationMs / 1000;
    
    console.log(`[PlayerBar] Seeking to ${percentage * 100}% (${percentage * duration}s)`);
    
    if (currentTrack.provider === 'spotify' && spotifyPlayer) {
      spotifyPlayer.seek(percentage * durationMs);
    } else if (audioRef.current) {
      audioRef.current.currentTime = percentage * duration;
    }
    
    setProgress(Math.floor(percentage * durationMs));
  };

  const handleToggleLike = async () => {
    if (!currentTrack) return;
    
    const isLiked = likedTracks.has(currentTrack.id);
    
    // Оптимистичное обновление
    toggleLike(currentTrack.id);
    
    try {
      const success = await window.electronAPI.invoke('like-track', { 
        providerId: currentTrack.provider, 
        trackId: currentTrack.id, 
        like: !isLiked 
      });

      if (!success) {
        // Rollback if failed
        toggleLike(currentTrack.id);
        showToast('Не удалось обновить статус лайка');
      }
    } catch (e) {
      toggleLike(currentTrack.id);
      console.error('Like toggle failed:', e);
    }
  };

  const handleAddToPlaylist = async (playlistId: string) => {
    if (!currentTrack) return;
    const success = await window.electronAPI.invoke('add-track-to-playlist', {
      providerId: currentTrack.provider,
      playlistId,
      trackId: currentTrack.id
    });
    if (success) {
      setShowPlaylistMenu(false);
    }
  };

  const createNewLocalPlaylist = async () => {
    if (!currentTrack) return;
    
    showPrompt({
      title: t.content.newPlaylistName,
      placeholder: t.content.playlistName,
      onConfirm: async (title) => {
        if (!title) return;
        try {
          const id = `local-${Date.now()}`;
          const newPlaylist: LocalPlaylist = {
            id,
            title,
            tracks: [currentTrack]
          };
          await window.electronAPI.invoke('save-local-playlist', { playlist: newPlaylist });
          await loadLocalPlaylists();
        } catch (e) {
          console.error('Failed to create local playlist:', e);
        } finally {
          setShowPlaylistMenu(false);
        }
      }
    });

    setShowPlaylistMenu(false); // Close the mini-menu immediately
  };

  const addTrackToLocalPlaylist = async (playlistId: string) => {
    if (!currentTrack) return;
    try {
      await window.electronAPI.invoke('add-to-local-playlist', { playlistId, track: currentTrack });
      await loadLocalPlaylists();
      showToast(t.content.addedToPlaylist);
    } catch (e) {
      console.error('Failed to add to local playlist:', e);
    } finally {
      setShowPlaylistMenu(false);
    }
  };

  const progressPercent = currentTrack && durationMs > 0
    ? (progressMs / durationMs) * 100 
    : 0;

  return (
    <div className="player-bar">
      {/* Скрытый тег аудео */}
      <audio 
        ref={audioRef} 
        src={currentTrack?.streamUrl} 
        onTimeUpdate={onTimeUpdate}
        onDurationChange={onDurationChange}
        onLoadedMetadata={onDurationChange}
        onEnded={() => nextTrack()}
        crossOrigin="anonymous"
        onError={() => {
          const audio = audioRef.current;
          if (audio && currentTrack?.provider === 'youtube') {
            console.error('[PlayerBar] YouTube Audio Error:', {
              code: audio.error?.code, // 1: aborted, 2: network, 3: decode, 4: src not supported
              message: audio.error?.message,
              networkState: audio.networkState,
              readyState: audio.readyState,
              src: audio.src.substring(0, 100)
            });
          }
        }}
      />

      {/* Left: Track Info */}
      <div className="player-track-info">
        {currentTrack ? (
          <>
            <div className="track-cover" style={{ backgroundImage: `url(${currentTrack.coverUrl || ''})` }}></div>
            <div className="track-meta">
              <div className="track-title">{currentTrack.title}</div>
              <div className="track-artist">{currentTrack.artist}</div>
            </div>
            <button 
              className={`nexus-like-toggle ${likedTracks.has(currentTrack.id) ? 'active' : ''}`} 
              onClick={handleToggleLike}
            >
              {likedTracks.has(currentTrack.id) ? <Minus size={18} /> : <Plus size={18} />}
            </button>
            <button 
              className="control-btn secondary" 
              onClick={() => setPosterModalOpen(true, currentTrack)}
              title="Create Nexus Poster"
            >
              <Share2 size={18} />
            </button>
            <div className="player-menu-container" style={{ position: 'relative' }} ref={playlistMenuRef}>
              <button 
                className={`control-btn secondary ${showPlaylistMenu ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPlaylistMenu(!showPlaylistMenu);
                  if (!showPlaylistMenu) {
                    setIsPlaylistsLoading(true);
                    window.electronAPI.invoke('get-playlists', currentTrack.provider)
                      .then(setPlaylists)
                      .finally(() => setIsPlaylistsLoading(false));
                  }
                }}
              >
                <MoreVertical size={18} />
              </button>
              {showPlaylistMenu && (
                <div 
                  className="playlist-mini-menu upward"
                  style={{ 
                    background: '#1a1a1a', 
                    border: '2px solid var(--accent-color)', 
                    boxShadow: '0 0 20px rgba(0,242,255,0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    opacity: 1,
                    visibility: 'visible'
                  }}
                >
                  <div className="menu-header">{t.content.addToPlaylist}</div>
                  <div className="menu-content">
                    {/* Local Playlists Section */}
                    <div 
                      className="menu-item highlight" 
                      onClick={() => createNewLocalPlaylist()}
                    >
                      <Plus size={14} style={{ marginRight: '8px' }} />
                      Создать новый плейлист...
                    </div>
                    {localPlaylists.map(lp => (
                      <div 
                        key={lp.id} 
                        className="menu-item" 
                        onClick={() => addTrackToLocalPlaylist(lp.id)}
                      >
                        <Library size={14} style={{ marginRight: '8px', opacity: 0.6 }} />
                        {lp.title}
                      </div>
                    ))}

                    <div className="menu-divider" />

                    {/* Provider Playlists Section */}
                    {isPlaylistsLoading ? (
                      <div className="menu-loading"><div className="spinner-small" /></div>
                    ) : playlists.length > 0 ? (
                      playlists.map(p => (
                        <div key={p.id} className="menu-item" onClick={() => handleAddToPlaylist(p.id)}>
                          <Music size={14} style={{ marginRight: '8px', opacity: 0.6 }} />
                          {p.title}
                        </div>
                      ))
                    ) : (
                      <div className="menu-empty">No provider playlists</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="track-meta">
            <div className="track-title">No track playing</div>
          </div>
        )}
      </div>

      {/* Center: Controls & Timeline */}
      <div className="player-controls-container">
        <div className="player-controls">
          <button 
            className={`control-btn secondary ${isShuffle ? 'active' : ''}`} 
            onClick={toggleShuffle}
            title={isShuffle ? 'Turn off shuffle' : 'Turn on shuffle'}
          >
            <Shuffle size={18} color={isShuffle ? 'var(--accent-color)' : 'currentColor'} />
          </button>
          <button 
            className="control-btn" 
            onClick={() => { console.log('[PlayerBar] Prev clicked'); prevTrack(); }}
          >
            <SkipBack size={24} fill="currentColor" />
          </button>
          <button className="control-btn primary" onClick={togglePlayPause}>
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
          </button>
          <button 
            className="control-btn" 
            onClick={() => { console.log('[PlayerBar] Next clicked'); nextTrack(); }}
          >
            <SkipForward size={24} fill="currentColor" />
          </button>
          <button 
            className={`control-btn secondary ${repeatMode !== 'none' ? 'active' : ''}`} 
            onClick={toggleRepeat}
            title={`Repeat: ${repeatMode}`}
          >
            <div style={{ position: 'relative' }}>
              <Repeat size={18} color={repeatMode !== 'none' ? 'var(--accent-color)' : 'currentColor'} />
              {repeatMode === 'one' && (
                <span style={{ 
                  position: 'absolute', 
                  top: '50%', 
                  left: '50%', 
                  transform: 'translate(-50%, -50%)', 
                  fontSize: '8px', 
                  fontWeight: 'bold',
                  color: 'var(--accent-color)'
                }}>1</span>
              )}
            </div>
          </button>
        </div>
        <div className="player-timeline">
          <span className="time">{Math.floor(progressMs / 60000)}:{String(Math.floor((progressMs % 60000) / 1000)).padStart(2, '0')}</span>
          <div 
            className="timeline-bar" 
            onMouseDown={(e) => {
              handleSeek(e);
              const bar = e.currentTarget;
              const onMove = (ev: MouseEvent) => {
                const rect = bar.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                if (currentTrack) {
                  const duration = durationMs / 1000;
                  if (currentTrack.provider === 'spotify' && spotifyPlayer) {
                    spotifyPlayer.seek(pct * durationMs);
                  } else if (audioRef.current) {
                    audioRef.current.currentTime = pct * duration;
                  }
                  setProgress(pct * durationMs);
                }
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
            style={{ cursor: 'pointer' }}
          >
            <div className="timeline-progress" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <span className="time">{currentTrack ? `${Math.floor(durationMs / 60000)}:${String(Math.floor((durationMs % 60000) / 1000)).padStart(2, '0')}` : '0:00'}</span>
        </div>
      </div>

      {/* Right: Volume & Extras */}
      <div className="player-extras">
        <button 
          className={`control-btn secondary ${isMuted ? 'active' : ''}`} 
          onClick={toggleMute}
        >
          {isMuted ? <VolumeX size={20} color="var(--accent-color)" /> : <Volume2 size={20} />}
        </button>
        <div 
          className="volume-bar" 
          onMouseDown={(e) => {
            const bar = e.currentTarget;
            const rect = bar.getBoundingClientRect();
            setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
            const onMove = (ev: MouseEvent) => {
              const r = bar.getBoundingClientRect();
              setVolume(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)));
            };
            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        >
          <div className="volume-progress" style={{ width: `${volume * 100}%` }}></div>
        </div>
        <button 
          className={`control-btn secondary m-left ${isEqEnabled ? 'active' : ''} ${isSoundSettingsOpen ? 'popover-active' : ''}`}
          onClick={() => setIsSoundSettingsOpen(!isSoundSettingsOpen)}
          title="Настройки звука"
        >
          <SlidersHorizontal size={18} color={(isEqEnabled || isSoundSettingsOpen) ? 'var(--accent-color)' : 'currentColor'} />
        </button>
        <button 
          className={`control-btn secondary m-left ${isLyricsOpen ? 'active' : ''}`}
          onClick={() => {
            if (!isLyricsOpen && currentTrack) {
              fetchLyrics(currentTrack);
            }
            setLyricsOpen(!isLyricsOpen);
          }}
          title="Lyrics"
        >
          <Mic2 size={18} color={isLyricsOpen ? 'var(--accent-color)' : 'currentColor'} />
        </button>
        <button 
          className={`control-btn secondary m-left ${activeView === 'focus' ? 'active' : ''}`}
          onClick={() => setActiveView(activeView === 'focus' ? (previousView || 'home') : 'focus', activeView === 'focus' ? previousProviderId : null)}
          title={activeView === 'focus' ? 'Вернуться в библиотеку' : 'Развернуть на весь экран'}
        >
          <Maximize2 size={18} />
        </button>
      </div>
      <SoundSettingsModal 
        isOpen={isSoundSettingsOpen} 
        onClose={() => setIsSoundSettingsOpen(false)} 
      />
    </div>
  );
};
