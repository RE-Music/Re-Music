import { useRef, useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize2, Repeat, Shuffle, Heart, MoreVertical, SlidersHorizontal } from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useAppStore } from '../../store/useAppStore';
import { useEqStore } from '../../store/useEqStore';
import { initAndResumeEq, ensureCtxRunning } from '../../hooks/useAudioEngine';
import { getTranslation } from '../../utils/i18n';

export const PlayerBar = () => {
  const { 
    currentTrack, isPlaying, volume, togglePlayPause, setVolume, setProgress, 
    nextTrack, prevTrack, progressMs, 
    isShuffle, toggleShuffle, repeatMode, toggleRepeat, isMuted, toggleMute,
    spotifyPlayer
  } = usePlayerStore();
  const { likedTracks, toggleLike, language, activeView, setActiveView } = useAppStore();
  const { isEnabled: isEqEnabled, toggleEq } = useEqStore();
  const t = getTranslation(language);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [isPlaylistsLoading, setIsPlaylistsLoading] = useState(false);

  // Синхронизация Play/Pause
  useEffect(() => {
    // For Spotify, the SDK state is managed internally by usePlayerStore -> togglePlayPause
    if (currentTrack?.provider === 'spotify') {
      if (audioRef.current) audioRef.current.pause(); // Ensure HTML5 player doesn't interfere
      return;
    }

    if (audioRef.current) {
      if (isPlaying) {
        // Ensure AudioContext is running BEFORE play() when EQ is active
        ensureCtxRunning().then(() => {
          const playPromise = audioRef.current?.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              if (error.name !== 'AbortError') {
                console.error('Playback error:', error);
              }
            });
          }
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  // Синхронизация громкости и Mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime * 1000);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentTrack) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const duration = currentTrack.durationMs / 1000;
    
    console.log(`[PlayerBar] Seeking to ${percentage * 100}% (${percentage * duration}s)`);
    
    if (currentTrack.provider === 'spotify' && spotifyPlayer) {
      spotifyPlayer.seek(percentage * currentTrack.durationMs);
    } else if (audioRef.current) {
      audioRef.current.currentTime = percentage * duration;
    }
    
    setProgress(percentage * currentTrack.durationMs);
  };

  const handleToggleLike = async () => {
    if (!currentTrack) return;
    
    const isLiked = likedTracks.has(currentTrack.id);
    const success = await window.electronAPI.invoke('like-track', { 
      providerId: currentTrack.provider, 
      trackId: currentTrack.id, 
      like: !isLiked 
    });

    if (success) {
      toggleLike(currentTrack.id);
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

  const progressPercent = currentTrack && audioRef.current 
    ? (audioRef.current.currentTime / audioRef.current.duration) * 100 
    : 0;

  return (
    <div className="player-bar">
      {/* Скрытый тег аудео */}
      <audio 
        ref={audioRef} 
        src={currentTrack?.streamUrl} 
        onTimeUpdate={onTimeUpdate}
        onEnded={() => nextTrack()}
        crossOrigin="anonymous"
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
              className={`control-btn secondary heart-btn ${likedTracks.has(currentTrack.id) ? 'active' : ''}`} 
              onClick={handleToggleLike}
            >
              <Heart size={18} fill={likedTracks.has(currentTrack.id) ? "var(--accent-color)" : "none"} />
            </button>
            <div className="player-menu-container">
              <button 
                className={`control-btn secondary ${showPlaylistMenu ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const isOpening = !showPlaylistMenu;
                  setShowPlaylistMenu(isOpening);
                  if (isOpening) {
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
                <div className="playlist-mini-menu player-upward-menu">
                  <div className="menu-header">{t.content.addToPlaylist}</div>
                  <div className="menu-content">
                    {isPlaylistsLoading ? (
                      <div className="menu-loading"><div className="spinner-small" /></div>
                    ) : playlists.length > 0 ? (
                      playlists.map(p => (
                        <div key={p.id} className="menu-item" onClick={() => handleAddToPlaylist(p.id)}>
                          {p.title}
                        </div>
                      ))
                    ) : (
                      <div className="menu-empty">No playlists found</div>
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
                  const duration = currentTrack.durationMs / 1000;
                  if (currentTrack.provider === 'spotify' && spotifyPlayer) {
                    spotifyPlayer.seek(pct * currentTrack.durationMs);
                  } else if (audioRef.current) {
                    audioRef.current.currentTime = pct * duration;
                  }
                  setProgress(pct * currentTrack.durationMs);
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
          <span className="time">{currentTrack ? `${Math.floor(currentTrack.durationMs / 60000)}:${String(Math.floor((currentTrack.durationMs % 60000) / 1000)).padStart(2, '0')}` : '0:00'}</span>
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
          className={`control-btn secondary m-left ${isEqEnabled ? 'active' : ''}`}
          onClick={() => {
            // Must call BEFORE toggleEq so we're still inside the user-gesture call stack
            if (!isEqEnabled) initAndResumeEq();
            toggleEq();
          }}
          title={isEqEnabled ? 'Выключить EQ' : 'Включить EQ'}
        >
          <SlidersHorizontal size={18} color={isEqEnabled ? 'var(--accent-color)' : 'currentColor'} />
        </button>
            <button 
              className={`control-btn secondary m-left ${activeView === 'focus' ? 'active' : ''}`}
              onClick={() => setActiveView(activeView === 'focus' ? 'home' : 'focus')}
              title={activeView === 'focus' ? 'Вернуться в библиотеку' : 'Развернуть на весь экран'}
            >
              <Maximize2 size={18} />
            </button>
      </div>
    </div>
  );
};
