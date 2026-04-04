import { useRef, useState } from 'react';
import { Download, X, Copy, Check } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/i18n';
import { toPng } from 'html-to-image';
import { QRCodeSVG } from 'qrcode.react';
import '../../styles/posters.css';

export const NexusPoster = () => {
  const { isPosterModalOpen, posterTrack, setPosterModalOpen, language, showToast } = useAppStore();
  const t = getTranslation(language) as any;
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isPosterModalOpen || !posterTrack) return null;

  // Unified code generation (same as PlayerBar)
  const normalizedId = posterTrack.id.includes(':') 
    ? posterTrack.id.split(':')[0] 
    : posterTrack.id;

  const shareData = {
    t: 't',
    p: posterTrack.provider,
    id: normalizedId,
    n: posterTrack.title,
    a: posterTrack.artist
  };
  const json = JSON.stringify(shareData);
  const nexusCode = `NEXUS:${btoa(unescape(encodeURIComponent(json)))}`;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setIsGenerating(true);
    try {
      await new Promise(r => setTimeout(r, 100));
      
      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2,
        skipAutoScale: true,
        cacheBust: true,
      });

      const link = document.createElement('a');
      link.download = `nexus-${posterTrack.title.toLowerCase().replace(/\s+/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
      showToast('Card saved successfully!');
    } catch (err) {
      console.error('Failed to generate poster:', err);
      showToast('Failed to generate image');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(nexusCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('Nexus code copied!');
  };

  return (
    <div className="poster-overlay" onClick={() => setPosterModalOpen(false)}>
      <div className="poster-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0 }}>{t.poster.title}</h2>
            <p style={{ margin: '4px 0 0 0', color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>{t.poster.subtitle}</p>
          </div>
          <button className="poster-close-btn" onClick={() => setPosterModalOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="poster-card-wrapper">
          <div className="poster-card" ref={cardRef}>
            <div className="poster-card-bg" style={{ backgroundImage: `url(${posterTrack.coverUrl})` }} />
            <div className="poster-card-content">
              <img 
                src={posterTrack.coverUrl || ''} 
                alt={posterTrack.title} 
                className="poster-artwork"
                crossOrigin="anonymous" 
              />
              <div className="poster-info">
                <h3 className="poster-title">{posterTrack.title}</h3>
                <p className="poster-artist">{posterTrack.artist}</p>
              </div>
              <div className="poster-footer">
                <div className="poster-qr-container">
                  <QRCodeSVG 
                    value={nexusCode} 
                    size={100} 
                    level="M"
                    includeMargin={false}
                    fgColor="#000000"
                    bgColor="#ffffff"
                  />
                </div>
                <div className="poster-nexus-label">SCAN TO IMPORT</div>
              </div>
            </div>
          </div>
        </div>

        <div className="poster-actions">
          <button 
            className="poster-btn poster-btn-secondary" 
            onClick={handleCopyCode}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {t.poster.copyCode}
          </button>
          <button 
            className="poster-btn poster-btn-primary" 
            onClick={handleDownload}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <div className="spinner-sm" style={{ width: '18px', height: '18px' }} />
            ) : (
              <Download size={18} />
            )}
            {isGenerating ? t.poster.generating : t.poster.download}
          </button>
        </div>
      </div>
    </div>
  );
};
