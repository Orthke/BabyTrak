import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../utils.js';
import { PlayFill, PauseFill, Plus } from '../icons.jsx';

// One side's stopwatch. Tracks accumulated seconds; only one side runs at a
// time (starting one pauses the other) to mirror real nursing.
function SideTimer({ side, seconds, running, onToggle }) {
  return (
    <div className={`timer-card ${running ? 'running' : ''}`}>
      <div className="side-label">{side}</div>
      <div className="time">{formatDuration(seconds)}</div>
      <button
        type="button"
        className={`timer-btn ${running ? '' : 'paused'}`}
        onClick={onToggle}
      >
        {running ? (
          <>
            <PauseFill size={14} /> Pause
          </>
        ) : (
          <>
            <PlayFill size={14} /> {seconds > 0 ? 'Resume' : 'Start'}
          </>
        )}
      </button>
    </div>
  );
}

// Controlled-ish: reports left/right seconds upward via onChange.
export default function BreastTimer({ value, onChange }) {
  // value: { left, right } in seconds
  const [active, setActive] = useState(null); // 'left' | 'right' | null
  const tickRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    tickRef.current = setInterval(() => {
      onChange((prev) => ({ ...prev, [active]: (prev[active] || 0) + 1 }));
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [active, onChange]);

  const toggle = (side) => {
    setActive((cur) => (cur === side ? null : side));
  };

  const adjust = (side, delta) => {
    onChange((prev) => ({ ...prev, [side]: Math.max(0, (prev[side] || 0) + delta) }));
  };

  return (
    <div className="stopwatch">
      <div className="breast-timers">
        <SideTimer side="Left" seconds={value.left} running={active === 'left'} onToggle={() => toggle('left')} />
        <SideTimer side="Right" seconds={value.right} running={active === 'right'} onToggle={() => toggle('right')} />
      </div>
      <div className="row" style={{ width: '100%' }}>
        <button type="button" className="btn btn-ghost" onClick={() => adjust('left', 60)}>
          <Plus size={16} /> 1 min Left
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => adjust('right', 60)}>
          <Plus size={16} /> 1 min Right
        </button>
      </div>
    </div>
  );
}
