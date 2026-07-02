import { useEffect, useRef, useState } from 'react';
import { api, serverNow } from '../api.js';
import { formatTime, KIND_META, FEED_TYPE_META, tile } from '../utils.js';
import { useToast } from '../components/Toast.jsx';
import { useBaby } from '../context/BabyContext.jsx';
import { KIND_ICONS, FEED_TYPE_ICONS, Calendar3 } from '../icons.jsx';
import { useKindFilter } from '../components/EntryFilter.jsx';
import { describe, editHeader, FORM_BY_KIND } from '../entryDisplay.jsx';
import Modal from '../components/Modal.jsx';

// How many days of columns to show, and how tall an hour is. DAY_HEIGHT must
// match the 48px hour band drawn as a gridline background in CSS (.tl-col).
const DAYS = 5;
const PX_PER_HOUR = 48;
const DAY_MS = 86400000;
const DAY_HEIGHT = PX_PER_HOUR * 24;

// Local midnight of the given date.
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Fraction of a day (0–1) that `ms` past midnight represents, in px down the column.
const yFor = (ms) => (ms / DAY_MS) * DAY_HEIGHT;

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
    const nowMin = (serverNow() - startOfDay(new Date()).getTime()) / 60000;
    scrollRef.current.scrollTop = Math.max(0, yFor(nowMin * 60000) - 120);
    scrolledRef.current = true;
  }, [items]);

  const onEdited = () => {
    setEditing(null);
    load();
  };

  if (items === null) {
    return <p className="empty">Loading…</p>;
  }

  const todayStart = startOfDay(new Date());
  // Oldest → newest, so today sits in the rightmost column.
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - (DAYS - 1 - i));
    return d;
  });

  const shown = items.filter((it) => shownKinds.has(it.kind));
  const hasAny = shown.length > 0;
  const nowMs = serverNow();

  return (
    <div className="timeline-page">
      <div className="history-head">{filterMenu}</div>

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

        <div className="tl-body" style={{ height: DAY_HEIGHT }}>
          <div className="tl-gutter">
            {HOUR_MARKS.map((h) => (
              <span key={h} className="tl-hour" style={{ top: h * PX_PER_HOUR }}>
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
