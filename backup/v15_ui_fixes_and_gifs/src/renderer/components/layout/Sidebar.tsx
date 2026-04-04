import { Search, Settings, Home, Heart, Activity, SlidersHorizontal, User } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/i18n';

export const Sidebar = () => {
  const { activeView, setActiveView } = useAppStore();

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-color)' }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M10 12l4-2-4-2v4z" fill="currentColor" />
        </svg>
        <h2 className="premium-font">Nano-Mus</h2>
      </div>

      <nav className="sidebar-nav">
        <button 
          className={`nav-item ${activeView === 'home' ? 'active' : ''}`}
          onClick={() => setActiveView('home')}
        >
          <div className="nav-icon-wrapper"><Home size={18} /></div>
          <span>ГЛАВНАЯ</span>
        </button>
        <button 
          className={`nav-item ${activeView === 'search' ? 'active' : ''}`}
          onClick={() => setActiveView('search')}
        >
          <div className="nav-icon-wrapper"><Search size={18} /></div>
          <span>ПОИСК</span>
        </button>
        <button 
          className={`nav-item ${activeView === 'liked' ? 'active' : ''}`}
          onClick={() => setActiveView('liked')}
        >
          <div className="nav-icon-wrapper"><Heart size={18} /></div>
          <span>ИЗБРАННОЕ</span>
        </button>
        <button 
          className={`nav-item ${activeView === 'wave' ? 'active' : ''}`}
          onClick={() => setActiveView('wave' as any)}
        >
          <div className="nav-icon-wrapper"><Activity size={18} /></div>
          <span>МОЯ ВОЛНА</span>
        </button>
        
        <div className="nav-divider" />
        
        <button 
          className={`nav-item ${activeView === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveView('profile' as any)}
        >
          <div className="nav-icon-wrapper"><User size={18} /></div>
          <span>ПРОФИЛЬ</span>
        </button>
        <button 
          className={`nav-item ${activeView === 'eq' ? 'active' : ''}`}
          onClick={() => setActiveView('eq')}
        >
          <div className="nav-icon-wrapper"><SlidersHorizontal size={18} /></div>
          <span>ЭКВАЛАЙЗЕР</span>
        </button>
      </nav>

      <div className="sidebar-section">
        <h3>Сервисы</h3>
        <div className="connected-services-row">
          <div className="service-icon-sm" style={{ color: '#1DB954' }}>S</div>
          <div className="service-icon-sm" style={{ color: '#FC3C44' }}>A</div>
          <div className="service-icon-sm" style={{ color: '#00F2FF' }}>T</div>
          <div className="service-icon-sm" style={{ color: '#FF4400' }}>SC</div>
        </div>
      </div>

      <div className="sidebar-footer">
        <button 
          className={`nav-item ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveView('settings')}
        >
          <div className="nav-icon-wrapper"><Settings size={18} /></div>
          <span>НАСТРОЙКИ</span>
        </button>
      </div>
    </div>
  );
};
