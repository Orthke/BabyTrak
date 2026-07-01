import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../utils.js';
import { PlayFill, PauseFill, Plus } from '../icons.jsx';

// Single stopwatch. Reports accumulated seconds upward via onChange.
export default function DurationTimer({ value, onChange, accent = 'var(--c-pump)' }) {
  const [running, setRunning] = useState(false);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => onChange((prev) => (prev || 0) + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, [running, onChange]);

  return (
    <div className="stopwatch">
      <div className={`timer-card ${running ? 'running' : ''}`} style={{ width: '100%', '--accent': accent }}>
        <div className="time">{formatDuration(value)}</div>
        <button
          type="button"
          className={`timer-btn ${running ? '' : 'paused'}`}
          onClick={() => setRunning((r) => !r)}
        >
          {running ? (
            <>
              <PauseFill size={14} /> Pause
            </>
          ) : (
            <>
              <PlayFill size={14} /> {value > 0 ? 'Resume' : 'Start'}
            </>
          )}
        </button>
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: '100%' }}
        onClick={() => onChange((prev) => (prev || 0) + 60)}
      >
        <Plus size={16} /> 1 min
      </button>
    </div>
  );
}
