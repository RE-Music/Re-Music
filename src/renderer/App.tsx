import { useEffect, useState, useRef } from 'react';
import { useAppStore } from './store/useAppStore';
import { User, Check, X, RefreshCw, Settings, Info } from 'lucide-react';
import { usePlayerStore } from './store/usePlayerStore';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useEqStore } from './store/useEqStore';
import { useAchievementStore } from './store/useAchievementStore';
import { ACHIEVEMENTS } from './components/layout/MainContent';
import { SplashScreen } from './components/SplashScreen';
import './styles/animations.css';
import './styles/globals.css';
import './styles/layout.css';
import './styles/sidebar.css';
import './styles/player.css';
import './styles/equalizer.css';
import './styles/content.css';
import './styles/settings.css';
import './styles/lyrics.css';

import { Sidebar } from './components/layout/Sidebar';
import { PlayerBar } from './components/layout/PlayerBar';
import { MainContent } from './components/layout/MainContent';
import { SpotifyPlayerManager } from './components/layout/SpotifyPlayerManager';
import { LyricsOverlay } from './components/lyrics/LyricsOverlay';
import { NexusPoster } from './components/modals/NexusPoster';
import { UpdateNotifier } from './components/UpdateNotifier';
import { ContextMenu } from './components/ui/ContextMenu';

const AchievementToast = () => {
  const { toastAchievement, setToastAchievement } = useAchievementStore();
  
  if (!toastAchievement) return null;
  
  const achievement = ACHIEVEMENTS.find(a => a.id === toastAchievement);
  if (!achievement) return null;
  
  return (
    <div className="achievement-toast-container">
      <div className="achievement-toast-card">
        <div className="achievement-toast-icon">
          <achievement.icon size={24} />
        </div>
        <div className="achievement-toast-info">
          <div className="achievement-toast-badge">ДОСТИЖЕНИЕ ПОЛУЧЕНО</div>
          <div className="achievement-toast-title">{achievement.title}</div>
          <div className="achievement-toast-desc">{achievement.description}</div>
        </div>
        <button className="achievement-toast-close" onClick={() => setToastAchievement(null)}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

const PromptModal = () => {
  const { promptConfig, closePrompt } = useAppStore();
  const [value, setValue] = useState(promptConfig?.initialValue || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (promptConfig) {
      setValue(promptConfig.initialValue || '');
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [promptConfig]);

  if (!promptConfig) return null;

  const handleConfirm = () => {
    promptConfig.onConfirm(value);
    closePrompt();
  };

  return (
    <div className="prompt-modal-overlay" onMouseDown={closePrompt}>
      <div className="prompt-modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{promptConfig.title}</h2>
        <input 
          ref={inputRef}
          className="prompt-modal-input"
          type="text" 
          placeholder={promptConfig.placeholder || '...'} 
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') closePrompt();
          }}
          autoFocus
        />
        <div className="prompt-modal-actions">
          <button className="prompt-modal-btn cancel" onClick={closePrompt}>
            {promptConfig.cancelText || 'ОТМЕНА'}
          </button>
          <button className="prompt-modal-btn confirm" onClick={handleConfirm}>
            {promptConfig.confirmText || 'ОК'}
          </button>
        </div>
      </div>
    </div>
  );
};
function App() {
  const { 
    setProviders, theme, setTheme, setLanguage, setAuthStatus, setLikedTracks, 
    profileName, setProfileName, setAvatarUrl, setLocalPlaylists, toast,
    showContextMenu, setActiveView
  } = useAppStore();
  const { currentTrack, isPlaying, progressMs, lyrics } = usePlayerStore();
  
  
  const [splashDone, setSplashDone] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  useAudioEngine();
  
  // Загружаем настройки и провайдеры из Main процесса
  useEffect(() => {
    async function initApp() {
      try {
        // Individual results to avoid blocking
        let providers = [];
        let settings: any = {};
        let authStatus = {};
        let likedTracks: any[] = [];

        const api = (window as any).electronAPI;

        if (api && typeof api.invoke === 'function') {
          // 1. Fetch critical data first
          providers = await api.invoke('get-providers').catch(() => []);
          settings = await api.invoke('get-settings').catch(() => ({}));
          authStatus = await api.invoke('check-auth').catch(() => ({}));
          
          // 2. Set critical state immediately to make app usable
          setProviders(providers);
          setAuthStatus(authStatus);
          
          if (settings.theme) setTheme(settings.theme);
          if (settings.language) setLanguage(settings.language);
          if (settings.profileName) setProfileName(settings.profileName);
          if (settings.avatarUrl) setAvatarUrl(settings.avatarUrl);
          if (settings.localPlaylists) setLocalPlaylists(settings.localPlaylists);
          if (settings.vibeGifMode) useAppStore.getState().setVibeGifMode(settings.vibeGifMode);
          if (typeof settings.volume === 'number') {
             usePlayerStore.getState().setVolume(settings.volume);
          }

          // 3. Mark initialized so splash can fade out
          setIsInitialized(true);

          // 4. Background services
          try {
            await useEqStore.getState().init();
            await useAchievementStore.getState().init();
          } catch (e) {
            console.warn('Background services initialization failed:', e);
          }

          // 5. Finally fetch slow data (liked tracks) in background
          likedTracks = await api.invoke('get-liked-tracks').catch(() => []);
          setLikedTracks(likedTracks.map((t: any) => t.id));
        } else {
          console.error('[App] Royale: window.electronAPI.invoke is missing during init phase');
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setIsInitialized(true);
      }
    }
    initApp();
  }, [setProviders, setTheme, setLanguage, setAuthStatus, setAvatarUrl, setLocalPlaylists, setProfileName]);

  // IPC Sync Logic (Royale Multi-Window Bridge) - Legacy, keeping for backend consistency but simplified
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api || !api.emit) return;

    // Main window: broadcast state (useful for future plugins/windows)
    api.emit('player-update', {
      currentTrack,
      isPlaying,
      progressMs,
      lyrics
    });
  }, [currentTrack?.id, isPlaying, progressMs, lyrics]);

  // Применяем тему к body
  useEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

  // Глобальный обработчик ПКМ
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      
      // If we clicked on an element that would have its own menu, let it handle it
      const target = e.target as HTMLElement;
      if (target.closest('.track-card') || target.closest('.sidebar-item')) return;

      showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { 
            label: 'Обновить', 
            icon: RefreshCw, 
            onClick: () => {
              window.location.reload();
            } 
          },
          { 
            label: 'Настройки', 
            icon: Settings, 
            onClick: () => setActiveView('settings')
          },
          { 
            label: 'О приложении', 
            icon: Info, 
            onClick: () => {
               // We could show a modal here later
               useAppStore.getState().showToast("RE:Music v1.1.3 - Build 2026");
            } 
          },
        ]
      });
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, [showContextMenu, setActiveView]);

  // Выдача достижения за участие в альфа-тесте
  useEffect(() => {
    if (isInitialized && splashDone) {
      const achievementStore = useAchievementStore.getState();
      // Выдаем с небольшой задержкой после сплеша для красоты
      setTimeout(() => {
        if (!achievementStore.isUnlocked('alpha-pioneer')) {
          achievementStore.unlock('alpha-pioneer');
        }
      }, 3000);
    }
  }, [isInitialized, splashDone]);
  
  const showOnboarding = isInitialized && splashDone && !profileName;

  useEffect(() => {
    if (showOnboarding) {
      document.body.style.setProperty('-webkit-app-region', 'no-drag');
      document.documentElement.style.setProperty('-webkit-app-region', 'no-drag');
      document.body.style.pointerEvents = 'auto';
      document.documentElement.style.pointerEvents = 'auto';
      document.body.style.userSelect = 'text';
    } else {
      document.body.style.removeProperty('-webkit-app-region');
      document.documentElement.style.removeProperty('-webkit-app-region');
      document.body.style.pointerEvents = '';
      document.documentElement.style.pointerEvents = '';
      document.body.style.userSelect = '';
    }
  }, [showOnboarding]);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    const api = (window as any).electronAPI;
    if (api) {
      await api.invoke('update-setting', { key: 'profileName', value: nameInput.trim() });
      setProfileName(nameInput.trim());
    }
  };

  return (
    <>
      {/* Global Onboarding Overlay (Absolute Root) */}
      {showOnboarding && (
        <div 
          className="onboarding-overlay" 
          onMouseDown={() => nameInputRef.current?.focus()}
          style={{ 
            background: '#050505', 
            zIndex: 9999999, 
            position: 'fixed', 
            inset: 0, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            pointerEvents: 'auto',
            cursor: 'default'
          } as any}
        >
          <div 
            className="onboarding-card"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ 
              pointerEvents: 'auto', 
              WebkitAppRegion: 'no-drag',
              zIndex: 10000001,
              background: '#121212',
              padding: '60px',
              borderRadius: '24px',
              border: '1px solid rgba(255,255,255,0.1)',
              textAlign: 'center',
              width: '100%',
              maxWidth: '480px',
              position: 'relative'
            } as any}
          >
            <div className="onboarding-icon" style={{ margin: '0 auto 30px auto', width: '80px', height: '80px', background: 'rgba(0,242,255,0.1)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)' } as any}>
              <User size={40} />
            </div>
            <h2 style={{ fontSize: '32px', marginBottom: '16px', fontWeight: 800 }}>Как к тебе обращаться?</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '40px', fontSize: '16px' }}>Привет! Давай познакомимся. Введи свое имя.</p>
            <div className="onboarding-input-group" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <input 
                ref={nameInputRef}
                type="text" 
                placeholder="Твое имя..." 
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                autoFocus
                style={{ 
                  background: '#000',
                  border: '2px solid #333',
                  borderRadius: '12px',
                  padding: '20px',
                  color: '#fff',
                  fontSize: '20px',
                  textAlign: 'center',
                  pointerEvents: 'auto', 
                  WebkitAppRegion: 'no-drag', 
                  userSelect: 'text',
                  cursor: 'text',
                  position: 'relative',
                  zIndex: 20000000
                } as any}
              />
              <button 
                onClick={handleSaveName} 
                disabled={!nameInput.trim()}
                style={{ 
                  background: '#fff',
                  color: '#000',
                  padding: '18px',
                  border: 'none',
                  borderRadius: '12px',
                  fontWeight: '900',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  cursor: 'pointer',
                  pointerEvents: 'auto', 
                  WebkitAppRegion: 'no-drag',
                  position: 'relative',
                  zIndex: 20000000
                } as any}
              >
                Поехали 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      {!showOnboarding && <div className="app-container">
        {!splashDone && <SplashScreen isReady={isInitialized} onDone={() => setSplashDone(true)} />}
        
        {/* Основной Layout */}
        <div className="app-layout">
          <Sidebar />
          <MainContent />
        </div>
        
        {/* Менеджер Spotify Web SDK */}
        <SpotifyPlayerManager />

        {/* Плеер всегда внизу */}
        <PlayerBar />
        
        {/* Оверлей с текстами */}
        <LyricsOverlay />
      </div>}
      <UpdateNotifier />
      <PromptModal />
      <NexusPoster />
      <AchievementToast />
      {toast?.visible && (
        <div className="share-toast glass-panel">
          <div className="toast-icon"><Check size={16} /></div>
          <span>{toast.message}</span>
        </div>
      )}
      <ContextMenu />
    </>
  );
}

export default App;
