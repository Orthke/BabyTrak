import { useEffect, useState } from 'react';
import { api, deleteByKind } from '../api.js';
import {
  formatTime,
  formatDate,
  formatMinutes,
  sleepSeconds,
  KIND_META,
  FEED_TYPE_META,
  tile,
  ML_PER_OZ,
  formatVolume,
} from '../utils.js';
import { useToast } from '../components/Toast.jsx';
import { useBaby } from '../context/BabyContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { KIND_ICONS, FEED_TYPE_ICONS, MoonStars, Trash3, BarChartLineFill, ChevronDown, CalendarRange } from '../icons.jsx';
import { useKindFilter } from '../components/EntryFilter.jsx';
import { describe, editHeader, FORM_BY_KIND } from '../entryDisplay.jsx';
import Modal from '../components/Modal.jsx';

// Days within this many days of today show on load; older days stay behind the
// "Load more" button, revealed OLDER_BATCH days at a time.
const RECENT_DAYS = 3;
const OLDER_BATCH = 5;

// Whole calendar days between `when` and today (0 = today, 1 = yesterday, …).
function daysAgo(when) {
  const a = new Date(when);
  a.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today - a) / 86400000);
}

// ISO -> local 'YYYY-MM-DD', so a range picker's date-input values can be
// compared against it lexically.
const dayKeyLocal = (iso) => new Date(iso).toLocaleDateString('en-CA');
const todayKeyLocal = () => new Date().toLocaleDateString('en-CA');
// `days` back from today, as the same 'YYYY-MM-DD' form.
function daysAgoKeyLocal(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-CA');
}

// Volumes (pump / bottle) are entered in ml or oz; convert everything to ml
// so a day mixing units still totals to a single figure.
function toMl(it) {
  if (it.amount == null) return null;
  if (it.unit === 'ml') return it.amount;
  if (it.unit === 'oz') return it.amount * ML_PER_OZ;
  return null;
}

function sumVolumes(items) {
  return items.reduce((s, it) => {
    const ml = toMl(it);
    return ml != null ? s + ml : s;
  }, 0);
}

function avgVolumes(items) {
  let sum = 0;
  let count = 0;
  for (const it of items) {
    const ml = toMl(it);
    if (ml != null) {
      sum += ml;
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

// Renders a volume total in the given display unit, e.g. "220 ml" / "7.4 oz". A
// zero/empty total reads as "—".
function formatVolumeTotal(ml, unit) {
  if (!ml) return '—';
  return formatVolume(ml, 'ml', unit);
}

// Roll a day's timeline entries into the totals shown in the summary modal.
function buildSummary(dayItems, volumeUnit) {
  const feeds = dayItems.filter((i) => i.kind === 'feed');
  const pumps = dayItems.filter((i) => i.kind === 'pump');
  const diapers = dayItems.filter((i) => i.kind === 'diaper');
  const sleeps = dayItems.filter((i) => i.kind === 'sleep');
  const milestones = dayItems.filter((i) => i.kind === 'milestone');

  // Bottle volume comes from bottle + combo feeds; breast-only feeds have none.
  const bottleFeeds = feeds.filter((f) => f.type === 'bottle' || f.type === 'both');
  // Only completed naps have a duration; an in-progress nap is skipped.
  const sleepSec = sleeps.reduce((s, n) => s + (n.end_time ? sleepSeconds(n) : 0), 0);

  return {
    feedCount: feeds.length,
    bottleVol: formatVolumeTotal(sumVolumes(bottleFeeds), volumeUnit),
    avgBottleVol: formatVolumeTotal(avgVolumes(bottleFeeds), volumeUnit),
    pumpVol: formatVolumeTotal(sumVolumes(pumps), volumeUnit),
    avgPumpVol: formatVolumeTotal(avgVolumes(pumps), volumeUnit),
    wet: diapers.filter((d) => d.wet).length,
    dirty: diapers.filter((d) => d.dirty).length,
    sleepSec,
    milestoneNames: milestones.map((m) => m.name).filter(Boolean),
  };
}

// Tabular day summary: feeding first, then diapers, sleep, and milestones.
function DaySummary({ items }) {
  const { volumeUnit } = useSettings();
  const s = buildSummary(items, volumeUnit);
  return (
    <table className="summary-table">
      <tbody>
        <tr className="summary-group">
          <th colSpan={2}>Feeding</th>
        </tr>
        <tr>
          <td>Feeds</td>
          <td>{s.feedCount}</td>
        </tr>
        <tr>
          <td>Bottle volume</td>
          <td>{s.bottleVol}</td>
        </tr>
        <tr>
          <td>Avg feed volume</td>
          <td>{s.avgBottleVol}</td>
        </tr>
        <tr>
          <td>Pumped volume</td>
          <td>{s.pumpVol}</td>
        </tr>
        <tr>
          <td>Avg pump volume</td>
          <td>{s.avgPumpVol}</td>
        </tr>

        <tr className="summary-group">
          <th colSpan={2}>Diapers</th>
        </tr>
        <tr>
          <td>Wet</td>
          <td>{s.wet}</td>
        </tr>
        <tr>
          <td>Dirty</td>
          <td>{s.dirty}</td>
        </tr>

        <tr className="summary-group">
          <th colSpan={2}>Sleep</th>
        </tr>
        <tr>
          <td>Total sleep</td>
          <td>{s.sleepSec ? formatMinutes(s.sleepSec) : '—'}</td>
        </tr>

        {s.milestoneNames.length > 0 && (
          <>
            <tr className="summary-group">
              <th colSpan={2}>Milestones</th>
            </tr>
            <tr>
              <td>Hit</td>
              <td>{s.milestoneNames.length}</td>
            </tr>
            <tr>
              <td className="summary-list" colSpan={2}>
                {s.milestoneNames.join(' · ')}
              </td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  );
}

// Date-range picker plus the same summary table, totalled over every item
// whose day falls between the two picked dates (inclusive).
function RangeSummary({ items }) {
  const today = todayKeyLocal();
  const [start, setStart] = useState(() => daysAgoKeyLocal(6));
  const [end, setEnd] = useState(today);

  const inRange = items.filter((it) => {
    const key = dayKeyLocal(it.when);
    return key >= start && key <= end;
  });

  return (
    <div>
      <div className="range-fields">
        <label>
          From
          <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={end} min={start} max={today} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {inRange.length === 0 ? <p className="empty">No entries in this range.</p> : <DaySummary items={inRange} />}
    </div>
  );
}

export default function History() {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null); // timeline item being edited
  const [summary, setSummary] = useState(null); // { day, items } shown in the summary modal
  const [rangeOpen, setRangeOpen] = useState(false); // range-summary modal open?
  const [collapsed, setCollapsed] = useState(() => new Set()); // day keys the user collapsed
  const [shownOlder, setShownOlder] = useState(0); // how many >3-day-old days are revealed
  const notify = useToast();
  const { subjectType, selectedId, selectedBaby, selectedCaregiver } = useBaby();
  const unitPrefs = useSettings();

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
    setShownOlder(0);
    setCollapsed(new Set());
    resetFilter(); // the temporary filter resets when the subject changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectType, selectedId, caregiverId]);

  const toggleDay = (day) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  const remove = async (item) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await deleteByKind(item.kind, item.id);
      setItems((prev) => prev.filter((i) => !(i.kind === item.kind && i.id === item.id)));
      notify('Deleted');
    } catch (e) {
      notify('Error: ' + e.message);
    }
  };

  const onEdited = () => {
    setEditing(null);
    load(); // re-pull so the row reflects the change (and re-sorts if time changed)
  };

  if (items === null) {
    return <p className="empty">Loading…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="empty">
        <MoonStars className="empty-icon" size={44} />
        <p>Nothing logged for {subjectName ?? 'them'} yet. Track something on the first tab.</p>
      </div>
    );
  }

  const filteredItems = items.filter((item) => shownKinds.has(item.kind));

  const groups = {};
  for (const item of filteredItems) {
    const day = formatDate(item.when);
    (groups[day] ??= []).push(item);
  }

  // Groups are already newest-first (items are). Split off days older than
  // RECENT_DAYS so they stay hidden until the user loads them.
  const dayGroups = Object.entries(groups);
  const recent = dayGroups.filter(([, di]) => daysAgo(di[0].when) <= RECENT_DAYS);
  const older = dayGroups.filter(([, di]) => daysAgo(di[0].when) > RECENT_DAYS);
  const visible = [...recent, ...older.slice(0, shownOlder)];
  const remainingOlder = older.length - Math.min(shownOlder, older.length);

  return (
    <div>
      <div className="history-head">
        {!isCaregiver && (
          <button type="button" className="filter-btn" onClick={() => setRangeOpen(true)}>
            <CalendarRange size={12} /> Select range
          </button>
        )}
        {filterMenu}
      </div>

      {filteredItems.length === 0 && (
        <p className="empty">No entries match the current filter.</p>
      )}

      {visible.map(([day, dayItems]) => {
        const isCollapsed = collapsed.has(day);
        return (
          <div key={day}>
            <p className="section-title">
              <button
                type="button"
                className="day-toggle"
                aria-expanded={!isCollapsed}
                onClick={() => toggleDay(day)}
              >
                <ChevronDown size={13} className={`day-caret ${isCollapsed ? 'collapsed' : ''}`} />
                {day}
              </button>
              {!isCaregiver && (
                <button className="summary-btn" onClick={() => setSummary({ day, items: dayItems })}>
                  <BarChartLineFill size={12} /> View summary
                </button>
              )}
            </p>
            <div className={`day-collapse ${isCollapsed ? 'collapsed' : ''}`}>
              <div className="day-body">
                {dayItems.map((item) => {
                  const isFeed = item.kind === 'feed';
                  const meta = isFeed ? FEED_TYPE_META[item.type] : KIND_META[item.kind];
                  const Icon = isFeed ? FEED_TYPE_ICONS[item.type] : KIND_ICONS[item.kind];
                  const { title, sub } = describe(item, unitPrefs);
                  return (
                    <div
                      key={`${item.kind}-${item.id}`}
                      className="timeline-item tappable"
                      role="button"
                      tabIndex={isCollapsed ? -1 : 0}
                      aria-hidden={isCollapsed}
                      onClick={() => setEditing(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setEditing(item);
                        }
                      }}
                    >
                      <span className="icon-tile ti-icon" style={tile(meta.color)}>
                        <Icon size={20} />
                      </span>
                      <div className="ti-body">
                        <div className="ti-title">{title}</div>
                        <div className="ti-sub">{sub}</div>
                        {item.comment && <div className="ti-comment">{item.comment}</div>}
                      </div>
                      <div className="ti-time">{formatTime(item.when)}</div>
                      <button
                        className="del-btn"
                        tabIndex={isCollapsed ? -1 : 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(item);
                        }}
                        aria-label="Delete"
                      >
                        <Trash3 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {remainingOlder > 0 && (
        <button
          type="button"
          className="btn btn-ghost load-more"
          onClick={() => setShownOlder((n) => n + OLDER_BATCH)}
        >
          Load more · {remainingOlder} earlier {remainingOlder === 1 ? 'day' : 'days'}
        </button>
      )}

      {summary && (
        <Modal
          title={`Summary · ${summary.day}`}
          icon={<BarChartLineFill size={18} color="var(--c-primary)" />}
          onClose={() => setSummary(null)}
        >
          <DaySummary items={summary.items} />
        </Modal>
      )}

      {rangeOpen && (
        <Modal
          title="Range summary"
          icon={<CalendarRange size={18} color="var(--c-primary)" />}
          onClose={() => setRangeOpen(false)}
        >
          <RangeSummary items={filteredItems} />
        </Modal>
      )}

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
