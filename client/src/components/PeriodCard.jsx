import { formatDayHalf, formatDays, periodDay, periodLengthDays, timeAgo } from '../utils.js';
import { KIND_ICONS, Plus } from '../icons.jsx';
import DragHandle from './DragHandle.jsx';
import HideToggle from './HideToggle.jsx';

const PeriodIcon = KIND_ICONS.period;
const COLOR = 'var(--c-period)';

function tile() {
  return { background: `color-mix(in srgb, ${COLOR} 14%, var(--c-card))`, color: COLOR };
}

// The Period card on the Track screen. `period` is the most recent period (from
// the timeline): with no end_time it's the one currently running, and the card
// switches from "start a period" to showing which day of it we're on. Tapping
// either way calls `onOpen` — Track decides whether that means starting a
// period or offering to end it / log a symptom.
export default function PeriodCard({ period, onOpen, drag, reordering, hidden, onToggleHide }) {
  const active = !!period && !period.end_time;
  const guard = (fn) => (drag ? drag.guardClick(fn) : fn);
  const controls =
    drag && reordering ? (
      <>
        <HideToggle hidden={hidden} onToggle={onToggleHide} />
        <DragHandle handleProps={drag.handleProps} />
      </>
    ) : null;

  return (
    <button
      ref={drag?.setNodeRef}
      type="button"
      className={`track-btn ${active ? 'period-card active' : ''} ${drag?.isDragging ? 'dragging' : ''} ${
        hidden ? 'card-hidden' : ''
      }`}
      style={drag?.style}
      onClick={guard(onOpen)}
    >
      <span className="icon-tile" style={tile()}>
        <PeriodIcon size={24} />
      </span>
      <span className="track-main">
        <div className="label">{active ? `Period · day ${periodDay(period)}` : 'Period'}</div>
        <div className="sub">
          {active ? (
            `Started ${formatDayHalf(period.start_time, period.start_half)}`
          ) : (
            <>
              <Plus size={13} /> Log a period start
            </>
          )}
        </div>
      </span>
      {!reordering && (
        <span className="track-last">
          {active ? (
            <div className="track-last-label">Tap to log the end or a symptom</div>
          ) : period ? (
            <>
              <div className="track-last-label">Last period</div>
              <div className="track-last-value" style={{ color: COLOR }}>
                {formatDays(periodLengthDays(period))}
              </div>
              <div className="track-last-time">{timeAgo(period.end_time ?? period.start_time)}</div>
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
