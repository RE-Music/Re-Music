import { useState, useEffect } from 'react';
import { ShieldCheck, Info, Languages, Trash2, Sun, ChevronDown, Zap } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { Language, Theme } from '../../store/useAppStore';
import { getTranslation } from '../../utils/i18n';

interface Settings {
  theme: Theme;
  language: Language;
  vibeGifMode: string;
  profileName: string;
}

export const SettingsView = () => {
  const { 
    providers, 
    setTheme, 
    language, 
    setLanguage, 
    vibeGifMode: _, 
    setVibeGifMode, 
    setAuthStatus: setGlobalAuthStatus,
    profileName: __,
    setProfileName
  } = useAppStore();
  const t = getTranslation(language) as any;
  
  const [settings, setSettings] = useState<Settings>({
    theme: 'tech-dark',
    language: 'ru',
    vibeGifMode: 'cats',
    profileName: ''
  });
  const [authStatus, setAuthStatus] = useState<Record<string, boolean>>({});
  const [authDetails, setAuthDetails] = useState<Record<string, { username: string; avatarUrl?: string } | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isThemeExpanded, setIsThemeExpanded] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settingsData, authData, detailsData] = await Promise.all([
        window.electronAPI.invoke('get-settings'),
        window.electronAPI.invoke('check-auth'),
        window.electronAPI.invoke('get-auth-details')
      ]);
      setSettings(settingsData);
      setAuthStatus(authData);
      setGlobalAuthStatus(authData);
      setVibeGifMode(settingsData.vibeGifMode || 'cats');
      setAuthDetails(detailsData);
    } catch (e) {
      console.error('Failed to load settings data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = async (key: keyof Settings, value: any) => {
    try {
      setSettings(prev => ({ ...prev, [key]: value }));
      if (key === 'theme') setTheme(value);
      if (key === 'language') setLanguage(value);
      if (key === 'vibeGifMode') setVibeGifMode(value);
      if (key === 'profileName') setProfileName(value);
      await window.electronAPI.invoke('update-setting', { key, value });
    } catch (e) {
      console.error(`Failed to update setting ${key}:`, e);
    }
  };



  const handleLogout = async (providerId: string) => {
    if (confirm(`Are you sure you want to logout from ${providerId}?`)) {
      await window.electronAPI.invoke('logout-provider', providerId);
      setAuthStatus(prev => ({ ...prev, [providerId]: false }));
    }
  };

  if (isLoading) return <div className="loading-text">Loading settings...</div>;

  return (
    <div className="settings-view">
      <div className="provider-header">
        <h1>{t.settings?.title || 'Settings'}</h1>
      </div>

      <div className="settings-grid">
        {/* Style Selection Section */}
        <section className="settings-section">
          <div className="section-title">
            <Sun size={20} />
            <h3>{t.settings?.themeTitle || 'Выбор стиля приложения'}</h3>
          </div>
          <p className="setting-hint">{t.settings?.themeHint || 'Выберите визуальное оформление Nano-Mus'}</p>
          
          <div className="theme-selector-container">
            <div 
              className="current-theme-card" 
              onClick={() => setIsThemeExpanded(!isThemeExpanded)}
            >
              <div className="theme-info-compact">
                <div className="theme-dot"></div>
                <span className="theme-name">
                  {settings.theme === 'tech-dark' ? 'Tech-Dark (Daft Punk)' : 
                   settings.theme === 'dark' ? 'Dark (Modern)' : 
                   settings.theme === 'old-dark' ? 'Old-Dark (Legacy)' : settings.theme}
                </span>
              </div>
              <ChevronDown className={`expand-icon ${isThemeExpanded ? 'expanded' : ''}`} size={20} />
            </div>

            <div className={`theme-options-grid ${isThemeExpanded ? 'expanded' : ''}`}>
              <div 
                className={`theme-option-card ${settings.theme === 'tech-dark' ? 'active' : ''}`}
                onClick={() => { updateSetting('theme', 'tech-dark'); setIsThemeExpanded(false); }}
              >
                <div className="theme-preview-mini tech-dark"></div>
                <div className="theme-option-info">
                  <span>Tech-Dark (Daft Punk)</span>
                  <span className="theme-status-tag">Active</span>
                </div>
              </div>

              <div 
                className={`theme-option-card ${settings.theme === 'dark' ? 'active' : ''}`}
                onClick={() => { updateSetting('theme', 'dark'); setIsThemeExpanded(false); }}
              >
                <div className="theme-preview-mini dark-modern"></div>
                <div className="theme-option-info">
                  <span>Dark (Modern)</span>
                  <span className="theme-status-tag">Clean</span>
                </div>
              </div>

              <div 
                className={`theme-option-card ${settings.theme === 'old-dark' ? 'active' : ''}`}
                onClick={() => { updateSetting('theme', 'old-dark'); setIsThemeExpanded(false); }}
              >
                <div className="theme-preview-mini classic"></div>
                <div className="theme-option-info">
                  <span>Old-Dark (Legacy)</span>
                  <span className="theme-status-tag">Original</span>
                </div>
              </div>
              
              <div className="theme-option-card disabled">
                <div className="theme-preview-mini placeholder"></div>
                <div className="theme-option-info">
                  <span>More styles coming soon...</span>
                  <span className="theme-status-tag">Locked</span>
                </div>
              </div>
            </div>
          </div>

          <div className="divider-glow" style={{ margin: '24px 0' }}></div>

          <div className="section-title">
            <Zap size={20} className="text-premium" />
            <h3>{t.settings?.vibeSection || 'Vibe Customization'}</h3>
          </div>
          <div className="setting-control">
            <label>{t.settings?.vibeGifMode || 'Core Animation Mode'}</label>
            <div className="language-selector-container">
              <Zap size={18} color="var(--accent-color)" />
              <select 
                value={settings.vibeGifMode} 
                onChange={(e) => updateSetting('vibeGifMode', e.target.value)}
                className="glass-select"
              >
                <option value="cats">{t.settings?.vibeCats || 'Cats Only 🐈'}</option>
                <option value="all">{t.settings?.vibeAll || 'All GIFs 🌈'}</option>
                <option value="off">{t.settings?.vibeOff || 'Static ⚡'}</option>
              </select>
            </div>
          </div>

          <div className="setting-control" style={{ marginTop: '24px' }}>
            <label>{t.settings?.language || 'Language'}</label>
            <div className="language-selector-container">
              <Languages size={18} color="var(--text-muted)" />
              <select 
                value={settings.language} 
                onChange={(e) => updateSetting('language', e.target.value)}
                className="glass-select"
              >
                <option value="ru">Русский (RU)</option>
                <option value="en">English (EN)</option>
              </select>
            </div>
          </div>
        </section>



        {/* Accounts Section */}
        <section className="settings-section">
          <div className="section-title">
            <ShieldCheck size={20} />
            <h3>{t.settings?.accounts || 'Accounts'}</h3>
          </div>
          
          <div className="setting-control" style={{ marginBottom: '16px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px border rgba(255,255,255,0.05)' }}>
            <label style={{ fontSize: '10px', opacity: 0.6 }}>Локальный профиль</label>
            <div className="input-with-action">
              <input 
                type="text" 
                placeholder="Твое имя..."
                value={settings.profileName}
                onChange={(e) => setSettings(prev => ({ ...prev, profileName: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && updateSetting('profileName', settings.profileName)}
              />
              <button 
                className="action-btn-small" 
                onClick={() => updateSetting('profileName', settings.profileName)}
              >
                OK
              </button>
            </div>
          </div>

          <div className="account-list">
            {providers.map(p => {
              const connected = !!authStatus[p.id];
              const details = authDetails[p.id];
              return (
              <div key={p.id} className="account-item">
                <div className="account-info">
                  <div className="provider-indicator" data-provider={p.id}></div>
                  {details?.avatarUrl && (
                    <img src={details.avatarUrl} className="profile-avatar" alt="" />
                  )}
                  <div className="account-details">
                    <span className="account-name">{p.name} {details?.username ? `(${details.username})` : ''}</span>
                    <span className={`account-status ${!connected ? 'disconnected' : ''}`}>
                      {connected ? t.settings?.connected : t.settings?.disconnected}
                    </span>
                  </div>
                </div>
                {connected ? (
                  <button className="logout-btn" onClick={() => handleLogout(p.id)}>
                    <Trash2 size={16} /> {t.settings?.disconnect}
                  </button>
                ) : (
                  <button className="action-btn-small" onClick={async () => {
                    const success = await window.electronAPI.invoke('auth-provider', p.id);
                    if (success) loadData();
                  }}>
                    {t.settings?.authorize || 'Connect'}
                  </button>
                )}
              </div>
            )})}
          </div>
        </section>

        {/* About Section */}
        <section className="settings-section">
          <div className="section-title">
            <Info size={20} />
            <h3>{t.settings?.about || 'About'}</h3>
          </div>
          <div className="about-info">
            <div className="info-row">
              <span>{t.settings?.version || 'Version'}</span>
              <span>1.0.9-alpha</span>
            </div>
            <div className="info-row">
              <span>{t.settings?.developers || 'Developers'}</span>
              <span>Antigravity AI & Team</span>
            </div>
            <div className="info-row :D">
              <span>{t.settings?.core || 'Core'}</span>
              <span>Tauri v2 + Vite + React</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
