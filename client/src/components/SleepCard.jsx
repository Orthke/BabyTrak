import { useEffect, useState } from 'react';
import { formatDuration, formatMinutes, formatTime, timeAgo, sleepSeconds } from '../utils.js';
import { serverNow } from '../api.js';
import { KIND_ICONS, PlayFill, StopFill } from '../icons.jsx';
import DragHandle from './DragHandle.jsx';
import HideToggle from './HideToggle.jsx';

const MoonIcon = KIND_ICONS.sleep;
const COLOR = 'var(--c-sleep)';

function tile() {
  return { background: `color-mix(in srgb, ${COLOR} 14%, var(--c-card))`, color: COLOR };
}

// A live nap timer on the Track screen. `sleep` is the most recent nap (from the
// timeline): if it has no end_time the baby is currently napping and the elapsed
// time ticks up from start_time; otherwise it shows the last completed nap.
// `drag` carries the dnd-kit sortable props so the card can be reordered.
export default function SleepCard({ sleep, onStart, onStop, busy, drag, reordering, hidden, onToggleHide }) {
  const active = !!sleep && !sleep.end_time;

  // Re-render once a second only while a nap is running, to advance the clock.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  const guard = (fn) => (drag ? drag.guardClick(fn) : fn);
  const isDragging = drag?.isDragging;
  const controls =
    drag && reordering ? (
      <>
        <HideToggle hidden={hidden} onToggle={onToggleHide} />
        <DragHandle handleProps={drag.handleProps} />
      </>
    ) : null;

  if (active) {
    return (
      <div
        ref={drag?.setNodeRef}
        className={`track-btn sleep-card active ${isDragging ? 'dragging' : ''} ${hidden ? 'card-hidden' : ''}`}
        style={{ ...drag?.style, '--accent': COLOR }}
      >
        <span className="icon-tile" style={tile()}>
          <MoonIcon size={24} />
        </span>
        <span className="track-main">
          <div className="label">Napping…</div>
          <div className="sub">Since {formatTime(sleep.start_time)}</div>
        </span>
        {!reordering && (
          <span className="track-last">
            <div className="sleep-elapsed">{formatDuration(sleepSeconds(sleep, serverNow()))}</div>
            <button type="button" className="btn-stop-nap" onClick={guard(onStop)} disabled={busy}>
              <StopFill size={14} /> Stop nap
            </button>
          </span>
        )}
        {controls}
      </div>
    );
  }

  return (
    <button
      ref={drag?.setNodeRef}
      type="button"
      className={`track-btn ${isDragging ? 'dragging' : ''} ${hidden ? 'card-hidden' : ''}`}
      style={drag?.style}
      onClick={guard(onStart)}
      disabled={busy}
    >
      <span className="icon-tile" style={tile()}>
        <MoonIcon size={24} />
      </span>
      <span className="track-main">
        <div className="label">Sleep</div>
        <div className="sub">
          <PlayFill size={12} /> Start a nap
        </div>
      </span>
      {!reordering && (
        <span className="track-last">
          {sleep ? (
            <>
              <div className="track-last-label">Last sleep</div>
              <div className="track-last-value" style={{ color: COLOR }}>
                {formatMinutes(sleepSeconds(sleep))}
              </div>
              <div className="track-last-time">{timeAgo(sleep.end_time ?? sleep.start_time)}</div>
            </>
          ) : (
            <div className="track-last-empty">None yet</div>
          )}
        </span>
      )}
      {controls}
    </button>
  );
}
