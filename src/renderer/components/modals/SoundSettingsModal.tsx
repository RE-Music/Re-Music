import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  RotateCcw, 
  Save, 
  Volume2, 
  Zap,
  Ear,
  Power,
  ChevronDown,
  Check
} from 'lucide-react';
import { useEqStore } from '../../store/useEqStore';
import { initAndResumeEq } from '../../hooks/useAudioEngine';
import './SoundSettingsModal.css';

interface SoundSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUALITY_OPTIONS = [
  { id: 'excellence', label: 'Excellence', desc: 'Lossless / 320kbps', icon: Zap },
  { id: 'optimal', label: 'Optimal', desc: '192kbps - HQ', icon: Volume2 },
];

const FREQ_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

export const SoundSettingsModal: React.FC<SoundSettingsModalProps> = ({ isOpen, onClose }) => {
  const { 
    gains, 
    activePreset, 
    isEnabled,
    setBand, 
    applyPreset, 
    saveCustomPreset, 
    toggleEq, 
    resetBands, 
    allPresets 
  } = useEqStore();

  const [showPresets, setShowPresets] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [quality, setQuality] = useState('excellence');

  const modalRef = useRef<HTMLDivElement>(null);
  const presets = allPresets();

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="sound-settings-popover" ref={modalRef}>
      <div className="popover-header">
        <div className="header-title">
          <Volume2 size={16} color="var(--accent-color)" />
          <span>Настройки звука</span>
        </div>
        <button className="close-btn" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="popover-content-container">
        {/* Quality Section */}
        <div className="popover-section">
          <div className="section-label">КАЧЕСТВО ПОТОКА</div>
          <div className="quality-options-mini">
            {QUALITY_OPTIONS.map(opt => (
              <div 
                key={opt.id} 
                className={`quality-pill-mini ${quality === opt.id ? 'active' : ''}`}
                onClick={() => setQuality(opt.id)}
              >
                <opt.icon size={14} />
                <div className="pill-text">
                  <span className="pill-title">{opt.label}</span>
                  <span className="pill-desc">{opt.desc}</span>
                </div>
                {quality === opt.id && <Check size={12} className="check-icon" />}
              </div>
            ))}
          </div>
        </div>

        {/* EQ Section */}
        <div className="popover-section">
          <div className="section-header-row">
            <div className="section-label">NEW-EQ</div>
            <div 
              className={`eq-toggle-mini ${isEnabled ? 'active' : ''}`} 
              onClick={() => {
                if (!isEnabled) initAndResumeEq();
                toggleEq();
              }}
            >
              <Power size={12} />
              <span>{isEnabled ? 'Включен' : 'Выключен'}</span>
            </div>
          </div>

          <div className={`eq-container-mini ${!isEnabled ? 'disabled' : ''}`}>
            {/* Minimal Curve Visualization */}
            <div className="eq-visualizer-mini">
              <svg viewBox="0 0 300 40" className="eq-curve-svg-mini">
                <defs>
                  <linearGradient id="eq-gradient-fill" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path 
                  d={`M 0 40 L 0 20 ${gains.map((g, i) => `L ${15 + i * 30} ${20 - g * 1.5}`).join(' ')} L 300 20 L 300 40 Z`}
                  fill="url(#eq-gradient-fill)"
                  className="eq-fill-path"
                />
                <path 
                  d={`M 0 20 ${gains.map((g, i) => `L ${15 + i * 30} ${20 - g * 1.5}`).join(' ')} L 300 20`}
                  fill="none" 
                  stroke="var(--accent-color)" 
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Compact Sliders */}
            <div className="sliders-row-mini">
              {gains.map((gain, i) => (
                <div key={i} className="eq-slider-mini">
                  <div className="slider-track-mini">
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="0.5"
                      value={gain}
                      disabled={!isEnabled}
                      onChange={(e) => setBand(i, parseFloat(e.target.value))}
                    />
                  </div>
                  <span className="freq-label-mini">{FREQ_LABELS[i]}</span>
                </div>
              ))}
            </div>

            {/* Preset Selector */}
            <div className="preset-selector-mini">
              <div className="preset-trigger-mini" onClick={() => setShowPresets(!showPresets)}>
                <Ear size={14} />
                <span>{activePreset || 'Custom'}</span>
                <ChevronDown size={12} style={{ transform: showPresets ? 'rotate(180deg)' : 'none' }} />
              </div>

              {showPresets && (
                <div className="presets-menu-mini glass-panel">
                  {presets.map(p => (
                    <div 
                      key={p.name} 
                      className={`preset-item-mini ${activePreset === p.name ? 'active' : ''}`}
                      onClick={() => {
                        applyPreset(p);
                        setShowPresets(false);
                      }}
                    >
                      {p.name}
                      {activePreset === p.name && <Check size={12} />}
                    </div>
                  ))}
                </div>
              )}

              <div className="preset-actions-mini">
                <button className="icon-btn-mini" onClick={resetBands} title="Reset">
                  <RotateCcw size={14} />
                </button>
                {isSaving ? (
                  <div className="save-preset-form-mini">
                    <input 
                      autoFocus
                      type="text"
                      placeholder="Name..."
                      value={newPresetName}
                      onChange={e => setNewPresetName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newPresetName.trim()) {
                          saveCustomPreset(newPresetName.trim());
                          setIsSaving(false);
                          setNewPresetName('');
                        }
                      }}
                    />
                    <button onClick={() => setIsSaving(false)} className="cancel">X</button>
                  </div>
                ) : (
                  <button className="save-btn-mini" onClick={() => setIsSaving(true)}>
                    <Save size={14} />
                    <span>СОХРАНИТЬ ПРЕСЕТ</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
