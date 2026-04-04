import { useEffect, useState } from 'react';

interface Props {
  isReady: boolean;
  onDone: () => void;
}

export const SplashScreen = ({ isReady, onDone }: Props) => {
  const [phase, setPhase] = useState<'visible' | 'fadeout'>('visible');
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    // Minimum time to show the logo animation (1.5s)
    const timer = setTimeout(() => setMinTimeElapsed(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Only fade out when BOTH the min timer has passed AND the app is ready
    if (minTimeElapsed && isReady) {
      setPhase('fadeout');
      const doneTimer = setTimeout(() => onDone(), 600); // Wait for CSS transition
      return () => clearTimeout(doneTimer);
    }
  }, [minTimeElapsed, isReady, onDone]);

  return (
    <div className={`splash-screen ${phase === 'fadeout' ? 'splash-fadeout' : ''}`}>
      <div className="splash-content">
        {/* Animated equalizer bars */}
        <div className="splash-logo">
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect className="splash-bar bar1" x="4"  y="0" width="12" height="60" rx="6" fill="var(--accent-color)" opacity="0.65"/>
            <rect className="splash-bar bar2" x="24" y="0" width="12" height="60" rx="6" fill="var(--accent-color)"/>
            <rect className="splash-bar bar3" x="44" y="0" width="12" height="60" rx="6" fill="var(--accent-color)" opacity="0.8"/>
          </svg>
        </div>
        <p className="splash-name">RE:Music</p>
      </div>
    </div>
  );
};
