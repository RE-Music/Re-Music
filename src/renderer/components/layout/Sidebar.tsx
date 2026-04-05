import { Search, Settings, Home, Heart, Activity, SlidersHorizontal, User, Library, Share, RefreshCw, Zap } from 'lucide-react';
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
        <button 
          className={`nav-item ${activeView === 'eq' ? 'active' : ''}`}
          onClick={() => setActiveView('eq')}
        >
          <div className="nav-icon-wrapper"><SlidersHorizontal size={18} /></div>
          <span>{t.sidebar?.eq || 'Эквалайзер'}</span>
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
                {p.id === 'yandex' ? 'Y' : p.name[0]}
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
          <span>{t.sidebar?.settings || 'Настройки'} (V8-DEBUG-NEXUS)</span>
        </button>
      </div>
    </div>
  );
};
