import { useState, useRef } from 'react';
import { Power, Save, RotateCcw } from 'lucide-react';
import { useEqStore } from '../../store/useEqStore';
import { initAndResumeEq } from '../../hooks/useAudioEngine';

const FREQ_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
const DB_RANGE = 12; // ±12 dB

/** Compute a smooth SVG polyline path through the gain points. */
function buildCurvePath(gains: number[], width: number, height: number): string {
  if (gains.length === 0) return '';
  const step = width / (gains.length - 1);
  const midY = height / 2;
  const scale = midY / DB_RANGE;
  const points = gains.map((g, i) => [i * step, midY - g * scale] as [number, number]);

  // Catmull-Rom → Bezier conversion for smooth curve
  const d: string[] = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev[0] + curr[0]) / 2;
    d.push(`C ${cpX} ${prev[1]}, ${cpX} ${curr[1]}, ${curr[0]} ${curr[1]}`);
  }
  return d.join(' ');
}

export const EqualizerView = () => {
  const {
    gains, activePreset, isEnabled,
    setBand, applyPreset, saveCustomPreset, deleteCustomPreset,
    toggleEq, resetBands, allPresets
  } = useEqStore();

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const SVG_W = 600;
  const SVG_H = 80;
  const path = buildCurvePath(gains, SVG_W, SVG_H);
  const midY = SVG_H / 2;

  const presets = allPresets();

  return (
    <div className="eq-view">
      {/* Header */}
      <div className="eq-header">
        <div className="eq-title-row">
          <h1>Эквалайзер</h1>
          <button
            className={`eq-power-btn ${isEnabled ? 'active' : ''}`}
            onClick={() => {
              if (!isEnabled) initAndResumeEq();
              toggleEq();
            }}
            title={isEnabled ? 'Выключить EQ' : 'Включить EQ'}
          >
            <Power size={20} />
            <span>{isEnabled ? 'Вкл' : 'Выкл'}</span>
          </button>
        </div>

        {/* Preset selector */}
        <div className="eq-presets-row">
          {presets.map(p => (
            <button
              key={p.name}
              className={`eq-preset-chip ${activePreset === p.name ? 'active' : ''}`}
              onClick={() => applyPreset(p)}
            >
              {p.name}
              {!p.readonly && (
                <span
                  className="eq-preset-delete"
                  title="Удалить"
                  onClick={(e) => { e.stopPropagation(); deleteCustomPreset(p.name); }}
                >
                  ×
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* EQ Curve SVG */}
      <div className="eq-curve-wrapper">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="eq-curve-svg"
          preserveAspectRatio="none"
        >
          {/* Center line (0 dB) */}
          <line x1="0" y1={midY} x2={SVG_W} y2={midY} className="eq-center-line" />
          {/* +6/-6 guide lines */}
          <line x1="0" y1={midY - (SVG_H / 2) * 0.5} x2={SVG_W} y2={midY - (SVG_H / 2) * 0.5} className="eq-guide-line" />
          <line x1="0" y1={midY + (SVG_H / 2) * 0.5} x2={SVG_W} y2={midY + (SVG_H / 2) * 0.5} className="eq-guide-line" />

          {/* Filled area under curve */}
          <defs>
            <linearGradient id="eqGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {path && (
            <path
              d={`${path} L ${SVG_W} ${midY} L 0 ${midY} Z`}
              fill="url(#eqGradient)"
            />
          )}
          {/* Main curve */}
          {path && (
            <path d={path} stroke="var(--accent-color)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          )}
          {/* Band dots */}
          {gains.map((g, i) => {
            const x = (i / (gains.length - 1)) * SVG_W;
            const y = midY - g * (midY / DB_RANGE);
            return <circle key={i} cx={x} cy={y} r="4" className="eq-curve-dot" />;
          })}
        </svg>
      </div>

      {/* Band sliders */}
      <div className={`eq-bands-container ${!isEnabled ? 'eq-disabled' : ''}`}>
        {gains.map((gain, i) => (
          <div key={i} className="eq-band">
            <span className="eq-db-label">+{DB_RANGE}</span>
            <input
              type="range"
              min={-DB_RANGE}
              max={DB_RANGE}
              step="0.5"
              value={gain}
              disabled={!isEnabled}
              className="eq-slider"
              onChange={(e) => setBand(i, parseFloat(e.target.value))}
            />
            <span className="eq-db-label">-{DB_RANGE}</span>
            <span className="eq-gain-value">{gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)} dB</span>
            <span className="eq-freq-label">{FREQ_LABELS[i]}</span>
          </div>
        ))}
      </div>

      {/* Action row */}
      <div className="eq-actions-row">
        <button className="eq-action-btn" onClick={resetBands} title="Сброс">
          <RotateCcw size={16} />
          Сброс
        </button>
        <button className="eq-action-btn primary" onClick={() => { setSaveDialogOpen(true); setPresetName(''); }}>
          <Save size={16} />
          Сохранить пресет
        </button>
      </div>

      {/* Save preset dialog */}
      {saveDialogOpen && (
        <div className="eq-dialog-overlay" onClick={() => setSaveDialogOpen(false)}>
          <div className="eq-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Сохранить пресет</h3>
            <input
              autoFocus
              type="text"
              className="eq-dialog-input"
              placeholder="Название пресета..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && presetName.trim()) {
                  saveCustomPreset(presetName.trim());
                  setSaveDialogOpen(false);
                }
                if (e.key === 'Escape') setSaveDialogOpen(false);
              }}
            />
            <div className="eq-dialog-btns">
              <button className="eq-dialog-cancel" onClick={() => setSaveDialogOpen(false)}>Отмена</button>
              <button
                className="eq-dialog-save"
                disabled={!presetName.trim()}
                onClick={() => { saveCustomPreset(presetName.trim()); setSaveDialogOpen(false); }}
              >
                <Save size={14} /> Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
