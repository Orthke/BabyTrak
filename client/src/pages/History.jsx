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
} from '../utils.js';
import { useToast } from '../components/Toast.jsx';
import { useBaby } from '../context/BabyContext.jsx';
import { KIND_ICONS, FEED_TYPE_ICONS, MoonStars, Trash3, BarChartLineFill, ChevronDown } from '../icons.jsx';
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

// Volumes (pump / bottle) are entered in ml or oz; we keep the two units
// separate rather than guess a conversion, so the total reads "120 ml + 4 oz"
// when a day mixes them.
function sumVolumes(items) {
  const acc = { ml: 0, oz: 0 };
  for (const it of items) {
    if (it.amount != null && (it.unit === 'ml' || it.unit === 'oz')) acc[it.unit] += it.amount;
  }
  return acc;
}

// Per-unit average volume, in the same { ml, oz } shape formatVolume expects.
// Each unit averages only over the entries that use it, so a day mixing units
// still reads sensibly (e.g. "120 ml" ml-entries and "4 oz" oz-entries average
// independently rather than being blended).
function avgVolumes(items) {
  const sum = { ml: 0, oz: 0 };
  const count = { ml: 0, oz: 0 };
  for (const it of items) {
    if (it.amount != null && (it.unit === 'ml' || it.unit === 'oz')) {
      sum[it.unit] += it.amount;
      count[it.unit] += 1;
    }
  }
  return {
    ml: count.ml ? sum.ml / count.ml : 0,
    oz: count.oz ? sum.oz / count.oz : 0,
  };
}

const ML_PER_OZ = 29.5735;

function formatVolume(acc) {
  const parts = [];
  // ml amounts get a fluid-ounce conversion in parentheses, e.g. "30 ml (1 oz)".
  if (acc.ml) parts.push(`${+acc.ml.toFixed(1)} ml (${+(acc.ml / ML_PER_OZ).toFixed(1)} oz)`);
  if (acc.oz) parts.push(`${+acc.oz.toFixed(1)} oz`);
  return parts.length ? parts.join(' + ') : '—';
}

// Roll a day's timeline entries into the totals shown in the summary modal.
function buildSummary(dayItems) {
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
    bottleVol: formatVolume(sumVolumes(bottleFeeds)),
    avgBottleVol: formatVolume(avgVolumes(bottleFeeds)),
    pumpVol: formatVolume(sumVolumes(pumps)),
    avgPumpVol: formatVolume(avgVolumes(pumps)),
    wet: diapers.filter((d) => d.wet).length,
    dirty: diapers.filter((d) => d.dirty).length,
    sleepSec,
    milestoneNames: milestones.map((m) => m.name).filter(Boolean),
  };
}

// Tabular day summary: feeding first, then diapers, sleep, and milestones.
function DaySummary({ items }) {
  const s = buildSummary(items);
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

export default function History() {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null); // timeline item being edited
  const [summary, setSummary] = useState(null); // { day, items } shown in the summary modal
  const [collapsed, setCollapsed] = useState(() => new Set()); // day keys the user collapsed
  const [shownOlder, setShownOlder] = useState(0); // how many >3-day-old days are revealed
  const notify = useToast();
  const { subjectType, selectedId, selectedBaby, selectedCaregiver } = useBaby();

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
      <div className="history-head">{filterMenu}</div>

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
                  const { title, sub } = describe(item);
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
