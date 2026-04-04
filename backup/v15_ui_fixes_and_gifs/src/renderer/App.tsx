import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { usePlayerStore } from './store/usePlayerStore';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useEqStore } from './store/useEqStore';
import { SplashScreen } from './components/SplashScreen';
import './styles/globals.css';
import './styles/layout.css';
import './styles/sidebar.css';
import './styles/player.css';
import './styles/equalizer.css';
import './styles/content.css';
import './styles/settings.css';

import { Sidebar } from './components/layout/Sidebar';
import { PlayerBar } from './components/layout/PlayerBar';
import { MainContent } from './components/layout/MainContent';
import { SpotifyPlayerManager } from './components/layout/SpotifyPlayerManager';

function App() {
  const { setProviders, theme, setTheme, setLanguage, setAuthStatus, setLikedTracks } = useAppStore();
  const [splashDone, setSplashDone] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  useAudioEngine();
  
  // Загружаем настройки и провайдеры из Main процесса
  useEffect(() => {
    async function initApp() {
      try {
        const [providers, settings, authStatus, likedTracks] = await Promise.all([
          window.electronAPI.invoke('get-providers'),
          window.electronAPI.invoke('get-settings'),
          window.electronAPI.invoke('check-auth'),
          window.electronAPI.invoke('get-liked-tracks'),
          useEqStore.getState().init()
        ]);
        setProviders(providers);
        setAuthStatus(authStatus);
        setLikedTracks(likedTracks.map((t: any) => t.id));
        if (settings.theme) setTheme(settings.theme);
        if (settings.language) setLanguage(settings.language);
        if (typeof settings.volume === 'number') {
           usePlayerStore.getState().setVolume(settings.volume);
        }
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        // Even on error, we should probably let the user in
        setIsInitialized(true);
      }
    }
    initApp();
  }, [setProviders, setTheme, setLanguage, setAuthStatus]);

  // Применяем тему к body
  useEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

  return (
    <div className="app-container">
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
    </div>
  );
}

export default App;
