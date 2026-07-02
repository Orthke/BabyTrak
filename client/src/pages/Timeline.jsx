import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, serverNow } from '../api.js';
import { formatTime, KIND_META, FEED_TYPE_META, tile } from '../utils.js';
import { useToast } from '../components/Toast.jsx';
import { useBaby } from '../context/BabyContext.jsx';
import { KIND_ICONS, FEED_TYPE_ICONS, Calendar3, ChevronLeft, ChevronRight } from '../icons.jsx';
import { useKindFilter } from '../components/EntryFilter.jsx';
import { describe, editHeader, FORM_BY_KIND } from '../entryDisplay.jsx';
import Modal from '../components/Modal.jsx';

// How many days of columns to show. The height of one hour is zoomable: it
// starts at DEFAULT_PPH and pinch/ctrl-scroll scales it within [MIN, MAX] px.
const DAYS = 5;
const DAY_MS = 86400000;
const DEFAULT_PPH = 48;
const MIN_PPH = 24;
const MAX_PPH = 200;
// The zoom level persists across tab changes (and reloads) — view preference
// only, so localStorage rather than the DB.
const PPH_KEY = 'babytrak.timelinePph';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The saved zoom, clamped to the allowed range; DEFAULT_PPH if unset/invalid.
function readSavedPph() {
  try {
    const saved = Number(localStorage.getItem(PPH_KEY));
    if (Number.isFinite(saved) && saved > 0) return clamp(saved, MIN_PPH, MAX_PPH);
  } catch {
    /* ignore unavailable storage */
  }
  return DEFAULT_PPH;
}

// Local midnight of the given date.
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Gutter labels: "12a", "3a" … "9p" every three hours.
function hourLabel(h) {
  const ap = h < 12 ? 'a' : 'p';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${ap}`;
}
const HOUR_MARKS = [0, 3, 6, 9, 12, 15, 18, 21];

// The kind color + icon for a timeline item (feeds split by sub-type).
function look(item) {
  if (item.kind === 'feed') return { color: FEED_TYPE_META[item.type].color, Icon: FEED_TYPE_ICONS[item.type] };
  return { color: KIND_META[item.kind].color, Icon: KIND_ICONS[item.kind] };
}

export default function Timeline() {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const notify = useToast();
  const { subjectType, selectedId, selectedBaby, selectedCaregiver } = useBaby();
  const scrollRef = useRef(null);
  const scrolledRef = useRef(false); // only auto-scroll to "now" once per subject

  // Zoom: px per hour. Kept in a ref too so the imperative gesture handlers read
  // the live value, and a pending scrollTop lets us re-anchor after a re-render.
  const [pph, setPph] = useState(readSavedPph);
  const pphRef = useRef(pph);
  const pendingScrollRef = useRef(null);
  useEffect(() => {
    pphRef.current = pph;
    try {
      localStorage.setItem(PPH_KEY, String(pph));
    } catch {
      /* ignore unavailable storage */
    }
  }, [pph]);
  // Apply the focal-anchored scroll after the taller/shorter grid has laid out.
  useLayoutEffect(() => {
    if (pendingScrollRef.current != null && scrollRef.current) {
      scrollRef.current.scrollTop = pendingScrollRef.current;
      pendingScrollRef.current = null;
    }
  }, [pph]);

  const dayHeight = pph * 24;
  const yFor = (ms) => (ms / DAY_MS) * dayHeight;

  // Which 5-day window is shown: 0 = ending today, negative = older windows.
  // Swiping (or the arrows) shifts by a whole window; you can't page past today.
  const [dayOffset, setDayOffset] = useState(0);
  const [slideDir, setSlideDir] = useState(null); // 'older' | 'newer', for the enter animation
  const offsetRef = useRef(0);
  useEffect(() => {
    offsetRef.current = dayOffset;
  }, [dayOffset]);

  const shift = useCallback((dir) => {
    const cur = offsetRef.current;
    const next = dir === 'newer' ? Math.min(0, cur + DAYS) : cur - DAYS;
    if (next === cur) return;
    setSlideDir(dir);
    setDayOffset(next);
  }, []);

  const isCaregiver = subjectType === 'caregiver';
  const caregiverId = selectedCaregiver?.id;
  const subjectName = isCaregiver ? selectedCaregiver?.name : selectedBaby?.name;

  const { shownKinds, filterMenu, reset: resetFilter } = useKindFilter(isCaregiver);

  const load = () =>
    (isCaregiver ? api.caregiverTimeline(caregiverId) : api.timeline(selectedId))
      .then(setItems)
      .catch((e) => notify('Error: ' + e.message));

  useEffect(() => {
    setItems(null);
    resetFilter();
    scrolledRef.current = false;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectType, selectedId, caregiverId]);

  // Once entries land, scroll the grid so the current time sits near the top —
  // the most recent events are what you want in view first.
  useEffect(() => {
    if (!items || scrolledRef.current || !scrollRef.current) return;
    const nowMs = serverNow() - startOfDay(new Date()).getTime();
    scrollRef.current.scrollTop = Math.max(0, (nowMs / DAY_MS) * (pphRef.current * 24) - 120);
    scrolledRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Pinch-to-zoom (two-finger touch) and ctrl/⌘ + wheel (trackpad pinch) scale
  // the hour height, keeping the pinched point anchored under the fingers. We
  // attach native non-passive listeners so we can preventDefault the browser's
  // own page zoom; the element re-mounts on each load, so we re-bind per `items`.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const distance = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const headH = () => el.querySelector('.tl-head')?.offsetHeight ?? 0;
    // Content-space (tl-body) fraction of the day at viewport offset `y`.
    const fractionAt = (y, startPph) => Math.max(0, (el.scrollTop + y - headH()) / (startPph * 24));
    // Re-anchor: after zooming to `nextPph`, keep `fraction` sitting at offset `y`.
    const zoomTo = (nextPph, fraction, y) => {
      const next = clamp(nextPph, MIN_PPH, MAX_PPH);
      pendingScrollRef.current = fraction * next * 24 + headH() - y;
      setPph(next);
    };

    const g = { active: false, startDist: 0, startPph: DEFAULT_PPH, fraction: 0, midY: 0 };
    const sw = { tracking: false, x: 0, y: 0 }; // one-finger horizontal swipe
    const SWIPE_MIN = 55; // px of horizontal travel to page the window

    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        sw.tracking = true;
        sw.x = e.touches[0].clientX;
        sw.y = e.touches[0].clientY;
        return;
      }
      sw.tracking = false; // a second finger means pinch, not swipe
      if (e.touches.length !== 2) return;
      const rect = el.getBoundingClientRect();
      g.midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      g.startDist = distance(e.touches);
      g.startPph = pphRef.current;
      g.fraction = fractionAt(g.midY, g.startPph);
      g.active = true;
      e.preventDefault();
    };
    const onTouchMove = (e) => {
      if (!g.active || e.touches.length !== 2) return;
      e.preventDefault();
      zoomTo(g.startPph * (distance(e.touches) / g.startDist), g.fraction, g.midY);
    };
    const onTouchEnd = (e) => {
      if (e.touches.length < 2) g.active = false;
      // Commit a horizontal swipe once the last finger lifts: dominant, far enough.
      if (sw.tracking && e.touches.length === 0) {
        const t = e.changedTouches[0];
        const dx = t.clientX - sw.x;
        const dy = t.clientY - sw.y;
        if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) {
          shift(dx > 0 ? 'older' : 'newer'); // drag right → older, left → newer
        }
      }
      sw.tracking = false;
    };
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return; // trackpad pinch surfaces as ctrl+wheel
      e.preventDefault();
      const y = e.clientY - el.getBoundingClientRect().top;
      const startPph = pphRef.current;
      zoomTo(startPph * Math.exp(-e.deltaY * 0.01), fractionAt(y, startPph), y);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, [items, shift]);

  const onEdited = () => {
    setEditing(null);
    load();
  };

  if (items === null) {
    return <p className="empty">Loading…</p>;
  }

  const todayStart = startOfDay(new Date());
  // The window ends `dayOffset` days from today; columns run oldest → newest so
  // the most recent day sits on the right.
  const windowEnd = new Date(todayStart);
  windowEnd.setDate(windowEnd.getDate() + dayOffset);
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(windowEnd);
    d.setDate(d.getDate() - (DAYS - 1 - i));
    return d;
  });
  const fmtDay = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const rangeLabel = `${fmtDay(days[0])} – ${fmtDay(days[DAYS - 1])}`;

  const shown = items.filter((it) => shownKinds.has(it.kind));
  const hasAny = shown.length > 0;
  const nowMs = serverNow();

  return (
    <div className="timeline-page">
      <div className="history-head">
        <div className="tl-nav">
          <button type="button" className="tl-nav-btn" onClick={() => shift('older')} aria-label="Earlier days">
            <ChevronLeft size={16} />
          </button>
          <span className="tl-range">{rangeLabel}</span>
          <button
            type="button"
            className="tl-nav-btn"
            onClick={() => shift('newer')}
            disabled={dayOffset === 0}
            aria-label="Later days"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {filterMenu}
      </div>

      {!hasAny && (
        <p className="empty">
          {items.length === 0
            ? `Nothing logged for ${subjectName ?? 'them'} yet. Track something on the first tab.`
            : 'No entries match the current filter.'}
        </p>
      )}

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-head">
          <div className="tl-gutter-head" />
          {days.map((d) => {
            const isToday = d.getTime() === todayStart.getTime();
            return (
              <div key={d.getTime()} className={`tl-col-head ${isToday ? 'today' : ''}`}>
                <span className="tl-dow">{isToday ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className="tl-date">{d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</span>
              </div>
            );
          })}
        </div>

        <div
          key={dayOffset}
          className={`tl-body ${slideDir === 'older' ? 'slide-older' : slideDir === 'newer' ? 'slide-newer' : ''}`}
          style={{ height: dayHeight, '--ph': `${pph}px` }}
        >
          <div className="tl-gutter">
            {HOUR_MARKS.map((h) => (
              <span key={h} className="tl-hour" style={{ top: h * pph }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>

          {days.map((d) => {
            const dayStart = d.getTime();
            const dayEnd = dayStart + DAY_MS;
            const isToday = dayStart === todayStart.getTime();
            // Events whose timestamp falls on this calendar day.
            const dayItems = shown.filter((it) => {
              const t = new Date(it.when).getTime();
              return t >= dayStart && t < dayEnd;
            });
            return (
              <div key={dayStart} className={`tl-col ${isToday ? 'today' : ''}`}>
                {dayItems.map((item) => {
                  const { color, Icon } = look(item);
                  const t = new Date(item.when).getTime();

                  // Sleeps render as a translucent bar spanning start→end (clipped
                  // to this day), with the icon chip pinned to the start.
                  let bar = null;
                  if (item.kind === 'sleep') {
                    const end = item.end_time ? new Date(item.end_time).getTime() : nowMs;
                    const bStart = Math.max(t, dayStart);
                    const bEnd = Math.min(end, dayEnd);
                    if (bEnd > bStart) {
                      bar = (
                        <div
                          className="tl-sleepbar"
                          style={{
                            top: yFor(bStart - dayStart),
                            height: yFor(bEnd - bStart),
                            background: `color-mix(in srgb, ${color} 20%, transparent)`,
                            borderColor: color,
                          }}
                        />
                      );
                    }
                  }

                  const top = yFor(Math.max(0, t - dayStart));
                  const { title } = describe(item);
                  return (
                    <div key={`${item.kind}-${item.id}`}>
                      {bar}
                      <button
                        type="button"
                        className="tl-event"
                        style={{ top }}
                        title={`${formatTime(item.when)} · ${title}`}
                        onClick={() => setEditing(item)}
                      >
                        <span className="icon-tile tl-ico" style={tile(color)}>
                          <Icon size={13} />
                        </span>
                        <span className="tl-etime">{formatTime(item.when)}</span>
                      </button>
                    </div>
                  );
                })}

                {isToday && <div className="tl-now" style={{ top: yFor(nowMs - dayStart) }} />}
              </div>
            );
          })}
        </div>
      </div>

      {editing &&
        (() => {
          const { label, color, Icon } = editHeader(editing);
          const EditForm = FORM_BY_KIND[editing.kind];
          return (
            <Modal
              title={`Edit ${label}`}
              icon={<Icon size={20} color={color} />}
              onClose={() => setEditing(null)}
            >
              <EditForm
                entry={editing}
                babyId={isCaregiver ? undefined : selectedId}
                caregiverId={isCaregiver ? caregiverId : undefined}
                notify={notify}
                onCancel={() => setEditing(null)}
                onSaved={onEdited}
              />
            </Modal>
          );
        })()}
    </div>
  );
}
