import { useEffect, useRef, useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import '../../styles/lyrics.css';

interface LyricsLine {
  time: number;
  text: string;
}

export const LyricsOverlay = () => {
  const { currentTrack, lyrics, isLyricsOpen, setLyricsOpen, progressMs, setProgress, spotifyPlayer } = usePlayerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const parsedLyrics = useMemo(() => {
    if (!lyrics || !lyrics.syncedLyrics) return [];
    
    const lines = lyrics.syncedLyrics.split('\n');
    const result: LyricsLine[] = [];
    const timeRegex = /\[(\d+):(\d+\.\d+)\]/;
    
    for (const line of lines) {
      const match = timeRegex.exec(line);
      if (match) {
        const minutes = parseInt(match[1]);
        const seconds = parseFloat(match[2]);
        const time = minutes * 60 + seconds;
        const text = line.replace(timeRegex, '').trim();
        if (text) {
          result.push({ time, text });
        }
      }
    }
    return result;
  }, [lyrics]);

  // Sync active index with progress
  useEffect(() => {
    if (parsedLyrics.length === 0 || !isLyricsOpen) return;
    
    const currentTime = progressMs / 1000;
    let index = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
        if (currentTime >= parsedLyrics[i].time) {
            index = i;
        } else {
            break;
        }
    }
    
    if (index !== activeIndex) {
      setActiveIndex(index);
      const activeElement = containerRef.current?.children[index] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [progressMs, parsedLyrics, activeIndex, isLyricsOpen]);

  if (!isLyricsOpen) return null;

  return (
    <div className="lyrics-overlay glass-panel">
      <div className="lyrics-background" style={{ backgroundImage: `url(${currentTrack?.coverUrl})` }} />
      
      <button className="lyrics-close" onClick={() => setLyricsOpen(false)}>
        <X size={24} />
      </button>

      <div className="lyrics-header">
        <h2>{currentTrack?.title}</h2>
        <p>{currentTrack?.artist}</p>
      </div>

      <div className="lyrics-container" ref={containerRef}>
        {parsedLyrics.length > 0 ? (
          parsedLyrics.map((line, index) => (
            <div 
              key={index} 
              className={`lyrics-line ${index === activeIndex ? 'active' : ''}`}
              onClick={() => {
                 if (currentTrack?.provider === 'spotify' && spotifyPlayer) {
                    spotifyPlayer.seek(line.time * 1000);
                 } else {
                    const audio = document.querySelector('audio');
                    if (audio) audio.currentTime = line.time;
                 }
                 setProgress(line.time * 1000);
              }}
            >
              {line.text}
            </div>
          ))
        ) : lyrics?.plainLyrics ? (
           <div className="lyrics-plain-container">
             {lyrics.plainLyrics.split('\n').map((l: string, i: number) => (
               <div key={i} className="lyrics-line-plain">{l}</div>
             ))}
           </div>
        ) : (
          <div className="lyrics-empty">
            {lyrics === null ? "Поиск текста..." : "Текст для этого трека не найден :("}
          </div>
        )}
      </div>
    </div>
  );
};
