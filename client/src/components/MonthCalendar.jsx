import { useRef, useState } from 'react';
import { KIND_META, FEED_TYPE_META } from '../utils.js';
import { ChevronLeft, ChevronRight } from '../icons.jsx';

// A month always renders as six weeks so the grid keeps the same shape (and the
// same row height) whichever month you're paging through.
const WEEKS = 6;
// Dots per cell before the rest collapse into a "+n".
const MAX_DOTS = 4;
const SWIPE_MIN = 55; // px of horizontal travel to page the month

// Local 'YYYY-MM-DD', the key entries are bucketed under.
const dayKey = (d) => d.toLocaleDateString('en-CA');

// Localized one-letter weekday headers, Sunday first (Jan 1 2023 was a Sunday).
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' })
);

// The kind color for an item — feeds are colored by their sub-type, as everywhere else.
const colorOf = (item) =>
  item.kind === 'feed' ? FEED_TYPE_META[item.type].color : KIND_META[item.kind].color;

// Every day a period covered, not just the two that carry the start and end
// events — a period is a run of days, and the calendar outlines the whole run.
// A period that hasn't ended yet runs through today.
function periodDays(items) {
  const days = new Set();
  for (const it of items) {
    if (it.kind !== 'period') continue;
    const d = new Date(it.start_time ?? it.when);
    d.setHours(0, 0, 0, 0);
    const end = it.end_time ? new Date(it.end_time) : new Date();
    end.setHours(0, 0, 0, 0);
    while (d <= end) {
      days.add(dayKey(d));
      d.setDate(d.getDate() + 1);
    }
  }
  return days;
}

// Month grid: one dot per kind logged on a day, tap a day for its summary.
// `filterMenu` rides along in the header row next to the month navigator.
export default function MonthCalendar({ items, onSelectDay, filterMenu }) {
  const [offset, setOffset] = useState(0); // months back from the current one; 0 = this month
  const [slideDir, setSlideDir] = useState(null); // 'older' | 'newer', for the enter animation
  const swipe = useRef({ x: 0, y: 0, tracking: false }).current;

  const shift = (dir) => {
    if (dir === 'newer' && offset === 0) return; // never page past the current month
    setSlideDir(dir);
    setOffset((o) => o + (dir === 'newer' ? 1 : -1));
  };

  const today = new Date();
  const todayKey = dayKey(today);
  const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);

  // Entries bucketed by the day they fall on.
  const byDay = {};
  for (const it of items) {
    (byDay[dayKey(new Date(it.when))] ??= []).push(it);
  }
  const bleeding = periodDays(items);

  // The grid starts on the Sunday on or before the 1st and runs six full weeks.
  const gridStart = new Date(month);
  gridStart.setDate(1 - month.getDay());
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const onTouchStart = (e) => {
    if (e.touches.length !== 1) {
      swipe.tracking = false;
      return;
    }
    swipe.tracking = true;
    swipe.x = e.touches[0].clientX;
    swipe.y = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    if (!swipe.tracking || e.touches.length !== 0) return;
    swipe.tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.x;
    const dy = t.clientY - swipe.y;
    // Dominant, far-enough horizontal drag: right → older, left → newer.
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx > 0 ? 'older' : 'newer');
  };

  return (
    <>
      <div className="history-head">
        <div className="tl-nav">
          <button type="button" className="tl-nav-btn" onClick={() => shift('older')} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <span className="tl-range">
            {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </span>
          <button
            type="button"
            className="tl-nav-btn"
            onClick={() => shift('newer')}
            disabled={offset === 0}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {filterMenu}
      </div>

      <div className="cal-wrap">
        <div className="cal-dow">
          {WEEKDAYS.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
        <div
          key={offset}
          className={`cal-grid ${slideDir === 'older' ? 'slide-older' : slideDir === 'newer' ? 'slide-newer' : ''}`}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {cells.map((d) => {
            const key = dayKey(d);
            const inMonth = d.getMonth() === month.getMonth();
            // The leading/trailing days belong to the neighbouring months; they
            // hold the grid's shape but aren't this month's story, so they stay
            // blank and untappable.
            const dayItems = inMonth ? byDay[key] ?? [] : [];
            // One dot per distinct kind color, so a day with six doses reads as
            // "medication" rather than a wall of identical dots.
            const colors = [];
            for (const it of dayItems) {
              const c = colorOf(it);
              if (!colors.includes(c)) colors.push(c);
            }
            const extra = colors.length - MAX_DOTS;
            return (
              <button
                key={key}
                type="button"
                className={`cal-cell ${inMonth ? '' : 'out'} ${inMonth && key === todayKey ? 'today' : ''} ${
                  inMonth && bleeding.has(key) ? 'period' : ''
                }`}
                disabled={!inMonth}
                onClick={() => onSelectDay(d, dayItems)}
                aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${
                  dayItems.length
                } ${dayItems.length === 1 ? 'entry' : 'entries'}${inMonth && bleeding.has(key) ? ' · period' : ''}`}
              >
                <span className="cal-num">{d.getDate()}</span>
                <span className="cal-dots">
                  {colors.slice(0, MAX_DOTS).map((c) => (
                    <span key={c} className="cal-dot" style={{ background: c }} />
                  ))}
                  {extra > 0 && <span className="cal-more">+{extra}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
