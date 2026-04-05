import { Search, Settings, Home, Heart, Activity, User, Library, Share, RefreshCw, Zap } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/i18n';

export const Sidebar = () => {
  console.log('[DEBUG] Sidebar v8.1 rendering');
  const { activeView, setActiveView, providers, authStatus, language, setImportModalOpen, showContextMenu } = useAppStore();
  const t = getTranslation(language) as any;

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-color)' }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M10 12l4-2-4-2v4z" fill="currentColor" />
        </svg>
        <h2 className="premium-font">RE:Music</h2>
      </div>

      <nav className="sidebar-nav">
        <button 
          className={`nav-item ${activeView === 'home' ? 'active' : ''}`}
          onClick={() => setActiveView('home')}
          onContextMenu={(e) => {
            e.preventDefault();
            showContextMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                { label: 'Перезагрузить Home', icon: RefreshCw, onClick: () => setActiveView('home') },
              ]
            });
          }}
        >
          <div className="nav-icon-wrapper"><Home size={18} /></div>
          <span>{t.sidebar?.home || 'GHOST_HUNTER'}</span>
        </button>
        <button 
          className={`nav-item ${activeView === 'search' ? 'active' : ''}`}
          onClick={() => setActiveView('search')}
        >
          <div className="nav-icon-wrapper"><Search size={18} /></div>
          <span>{t.sidebar?.search || 'Поиск'}</span>
        </button>
        <button 
          className={`nav-item ${activeView === 'liked' ? 'active' : ''}`}
          onClick={() => setActiveView('liked')}
        >
          <div className="nav-icon-wrapper"><Heart size={18} /></div>
          <span>{t.sidebar?.liked || 'Избранное'}</span>
        </button>
        <button 
          className={`nav-item ${activeView === 'local_playlists' ? 'active' : ''}`}
          onClick={() => setActiveView('local_playlists')}
        >
          <div className="nav-icon-wrapper"><Library size={18} /></div>
          <span>{t.sidebar?.playlists || 'Плейлисты'}</span>
        </button>
        <button 
          className={`nav-item ${activeView === 'wave' ? 'active' : ''}`}
          onClick={() => setActiveView('wave' as any)}
        >
          <div className="nav-icon-wrapper"><Activity size={18} /></div>
          <span>{t.sidebar?.wave || 'Моя волна'}</span>
        </button>

        <button 
          className="nav-item"
          onClick={() => setImportModalOpen(true)}
        >
          <div className="nav-icon-wrapper"><Share size={18} /></div>
          <span>{t.sidebar?.import || 'Импорт по коду'}</span>
        </button>
        
        <div className="nav-divider" />
        
        <button 
          className={`nav-item ${activeView === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveView('profile' as any)}
        >
          <div className="nav-icon-wrapper"><User size={18} /></div>
          <span>{t.sidebar?.profile || 'Профиль'}</span>
        </button>

      </nav>

      <div className="sidebar-section">
        <h3>{t.sidebar?.services || 'Сервисы'}</h3>
        <div className="connected-services-row">
          {providers.map(p => {
            const connected = authStatus[p.id];
            if (!connected) return null;
            return (
              <div 
                key={p.id} 
                className="service-icon-sm connected" 
                data-provider={p.id}
                title={p.name}
                onClick={() => setActiveView('provider', p.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  showContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                      { label: `Открыть ${p.name}`, icon: Zap, onClick: () => setActiveView('provider', p.id) },
                      { label: 'Переавторизоваться', icon: RefreshCw, onClick: () => {
                         window.electronAPI.invoke('auth-provider', p.id).then((success) => {
                           if (success) setActiveView('provider', p.id);
                         });
                      }},
                    ]
                  });
                }}
              >
                {p.id === 'yandex' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.44 21.05V1.28H15.6V21.05H12.44ZM4.44 21.05V13.84H7.6V21.05H4.44ZM8.44 21.05V9.45H11.6V21.05H8.44Z" />
                  </svg>
                ) : p.id === 'spotify' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.492 17.306c-.215.352-.676.465-1.028.25-2.856-1.745-6.452-2.14-10.686-1.173-.404.093-.81-.157-.903-.561-.093-.404.157-.81.561-.903 4.636-1.06 8.614-.61 11.806 1.342.352.215.465.676.25 1.028zm1.464-3.256c-.271.44-.848.58-1.288.309-3.27-2.01-8.253-2.595-12.119-1.42-.496.15-1.022-.128-1.172-.624-.15-.496.128-1.022.624-1.172 4.417-1.34 9.907-.69 13.67 1.624.44.271.58.848.309 1.288zm.126-3.376c-3.922-2.328-10.395-2.545-14.154-1.404-.602.183-1.238-.158-1.421-.76-.183-.602.158-1.238.76-1.421 4.316-1.31 11.46-1.057 16.002 1.636.541.32.714 1.018.394 1.558-.32.541-1.018.714-1.558.394z" />
                  </svg>
                ) : p.id === 'youtube' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                  </svg>
                ) : p.id === 'soundcloud' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10.16 11.758c0-.6.182-1.162.533-1.638-1.309-1.01-2.909-1.345-4.436-1.345-3.359 0-6.082 2.723-6.082 6.082 0 1.94 1.042 3.144 2.868 3.144h7.651c.334 0 .611-.277.611-.611s-.277-.611-.611-.611h-7.651c-1.332 0-1.646-.864-1.646-1.922 0-2.684 2.176-4.86 4.86-4.86 1.488 0 2.5.42 3.23 1.345.313.393.186.733.186.733.155.454.482.683.487.683zm13.84 3.09c0-1.741-1.411-3.152-3.152-3.152-.165 0-.323.013-.478.038-.344-2.144-2.196-3.784-4.434-3.784-.442 0-.862.065-1.257.186-.312.096-.549.336-.615.651l-.316 1.503c-.065.312.096.549.408.615l.61.129c.312.065.549-.096.615-.408l.142-.677c.125-.038.257-.058.397-.058 1.52 0 2.752 1.232 2.752 2.752.001.312.278.589.612.589.334 0 .611-.277.611-.611 0 .285.086.551.234.773.136.204.364.331.62.331h3.43c.961 0 1.741.78 1.741 1.741s-.78 1.741-1.741 1.741h-8.084c-.334 0-.611.277-.611.611s.277.611.611.611h8.084c1.636 0 2.963-1.327 2.963-2.963z" />
                  </svg>
                ) : p.name[0]}
              </div>
            );
          })}
          {(!authStatus || Object.values(authStatus).every(v => !v)) && (
            <span className="no-services-hint">{t.sidebar?.noServices || 'Нет подключенных сервисов'}</span>
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <button 
          className={`nav-item ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveView('settings')}
        >
          <div className="nav-icon-wrapper"><Settings size={18} /></div>
          <span>{t.sidebar?.settings || 'Настройки'}</span>
        </button>
      </div>
    </div>
  );
};
