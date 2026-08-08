import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { api, serverNow } from '../api.js';
import {
  timeAgo,
  formatMinutes,
  formatTime,
  measurementSummary,
  formatTemp,
  formatBP,
  formatBloodSugar,
  formatVolume,
  formatDayHalf,
  periodDay,
} from '../utils.js';
import Modal from '../components/Modal.jsx';
import FeedForm from '../forms/FeedForm.jsx';
import PumpForm from '../forms/PumpForm.jsx';
import DiaperForm from '../forms/DiaperForm.jsx';
import MedForm from '../forms/MedForm.jsx';
import MilestoneForm from '../forms/MilestoneForm.jsx';
import MeasurementForm from '../forms/MeasurementForm.jsx';
import TemperatureForm from '../forms/TemperatureForm.jsx';
import BloodPressureForm from '../forms/BloodPressureForm.jsx';
import BloodSugarForm from '../forms/BloodSugarForm.jsx';
import PeriodForm from '../forms/PeriodForm.jsx';
import SymptomForm from '../forms/SymptomForm.jsx';
import SleepForm from '../forms/SleepForm.jsx';
import SleepCard from '../components/SleepCard.jsx';
import ElapsedField from '../components/ElapsedField.jsx';
import PeriodCard from '../components/PeriodCard.jsx';
import DragHandle from '../components/DragHandle.jsx';
import HideToggle from '../components/HideToggle.jsx';
import { useToast } from '../components/Toast.jsx';
import { useBaby } from '../context/BabyContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { KIND_ICONS, PlayFill, Pencil, ClockHistory } from '../icons.jsx';

const OPTIONS = [
  {
    kind: 'feed',
    label: 'Feed',
    sub: 'Breast, bottle, or both',
    color: 'var(--c-breast)',
    Form: FeedForm,
  },
  {
    kind: 'pump',
    label: 'Pump',
    sub: 'Duration and volume collected',
    color: 'var(--c-pump)',
    Form: PumpForm,
  },
  {
    kind: 'diaper',
    label: 'Diaper',
    sub: 'Wet, dirty, or both',
    color: 'var(--c-diaper)',
    Form: DiaperForm,
  },
  {
    kind: 'med',
    label: 'Medication',
    sub: 'Dose by pills, mg, drops, or ml',
    color: 'var(--c-med)',
    Form: MedForm,
  },
  {
    kind: 'milestone',
    label: 'Milestone',
    sub: 'A first, a moment, an achievement',
    color: 'var(--c-milestone)',
    Form: MilestoneForm,
  },
  {
    kind: 'measurement',
    label: 'Measurement',
    sub: 'Weight and length / height',
    color: 'var(--c-measure)',
    Form: MeasurementForm,
  },
  {
    kind: 'temperature',
    label: 'Temperature',
    sub: 'A fever check or reading',
    color: 'var(--c-temp)',
    Form: TemperatureForm,
  },
  {
    kind: 'bp',
    label: 'Blood pressure',
    sub: 'Systolic / diastolic, with pulse',
    color: 'var(--c-bp)',
    Form: BloodPressureForm,
    caregiverOnly: true, // blood pressure is tracked for caregivers, not babies
  },
  {
    kind: 'sugar',
    label: 'Blood sugar',
    sub: 'Glucose reading, fasting or with meals',
    color: 'var(--c-sugar)',
    Form: BloodSugarForm,
  },
];

// Kinds a caregiver can track (they don't have feeds, diapers, etc.). 'period'
// isn't in OPTIONS: like sleep, it doesn't open a form straight from the card —
// it has its own card and its own flow, so it's named here instead.
const CAREGIVER_KINDS = ['med', 'temperature', 'bp', 'sugar', 'period'];

function tile(color) {
  return { background: `color-mix(in srgb, ${color} 14%, var(--c-card))`, color };
}

// One-line summary of the most recent entry of a kind, shown on the right of its
// card: volume for feeds/pumps, what was in the diaper, or the medication name.
function lastSummary(item, unitPrefs = {}) {
  switch (item.kind) {
    case 'feed': {
      if (item.amount != null) return formatVolume(item.amount, item.unit, unitPrefs.volumeUnit ?? item.unit);
      const secs = (item.left_seconds || 0) + (item.right_seconds || 0);
      // A breast feed with no time logged is an attempt that didn't take.
      return secs ? formatMinutes(secs) : 'Attempted to feed';
    }
    case 'pump':
      return item.amount != null ? formatVolume(item.amount, item.unit, unitPrefs.volumeUnit ?? item.unit) : null;
    case 'diaper':
      if (item.wet && item.dirty) return 'Wet & dirty';
      if (item.wet) return 'Wet';
      if (item.dirty) return 'Dirty';
      return null;
    case 'med':
    case 'milestone':
      return item.name;
    case 'measurement':
      return measurementSummary(item, unitPrefs.weightUnit ?? item.weight_unit, item.height_unit);
    case 'temperature':
      return formatTemp(item.temp, item.unit);
    case 'bp':
      return formatBP(item.systolic, item.diastolic);
    case 'sugar':
      return formatBloodSugar(item.value, item.unit);
    default:
      return null;
  }
}

// Must be a stable reference: passing a fresh options object each render makes
// useSensor produce a new sensor every render, so DndContext re-creates its
// sensors when the drag-start re-render happens — which aborts the drag
// immediately. Hoisting it here keeps the sensor identity stable.
// Drag is initiated from a dedicated handle, so it starts as soon as the handle
// is moved a few pixels (no long-press needed); swiping the card body scrolls.
const SENSOR_OPTIONS = { activationConstraint: { distance: 8 } };

const OPTION_BY_KIND = Object.fromEntries(OPTIONS.map((o) => [o.kind, o]));
// Kinds a baby can track: everything except caregiver-only kinds (blood pressure).
const BABY_KINDS = OPTIONS.filter((o) => !o.caregiverOnly).map((o) => o.kind);
// The full set of baby cards, in their out-of-the-box order. Sleep leads; the rest
// follow the OPTIONS order. The user can reorder them and we persist that.
const DEFAULT_ORDER = ['sleep', ...BABY_KINDS];
const ORDER_KEY = 'babytrak.trackOrder';
// Cards the user has hidden, scoped by subject type: { baby: [...], caregiver:
// [...] } so hiding a card for babies doesn't hide it for caregivers (and vice
// versa). The history/timeline filter reads the same key for the same scope.
const HIDDEN_KEY = 'babytrak.hiddenKinds';

function loadOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || 'null');
    if (Array.isArray(saved) && saved.every((k) => typeof k === 'string')) return saved;
  } catch {
    /* ignore malformed storage */
  }
  return DEFAULT_ORDER;
}

// The whole { baby, caregiver } hidden map. Tolerates a legacy flat array from an
// earlier build by treating it as the baby scope (that's the view it came from).
function loadHiddenMap() {
  try {
    const saved = JSON.parse(localStorage.getItem(HIDDEN_KEY) || 'null');
    if (Array.isArray(saved)) return { baby: saved.filter((k) => typeof k === 'string') };
    if (saved && typeof saved === 'object') return saved;
  } catch {
    /* ignore malformed storage */
  }
  return {};
}

// The hidden set for one scope ('baby' | 'caregiver').
function loadHidden(scope) {
  const arr = loadHiddenMap()[scope];
  return new Set(Array.isArray(arr) ? arr.filter((k) => typeof k === 'string') : []);
}

// Wraps a track card so it can be dragged to reorder via its grip handle.
// `setNodeRef`/`style` go on the card (the thing that moves); `handleProps` go
// on the grip (the only part that starts a drag). `guardClick` swallows the
// click that fires right after a drag so dropping doesn't also open the card.
function SortableTrackItem({ id, children }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id });
  const draggedRef = useRef(false);
  useEffect(() => {
    if (isDragging) draggedRef.current = true;
  }, [isDragging]);

  const guardClick = useCallback(
    (fn) => (e) => {
      if (draggedRef.current) {
        draggedRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      fn?.(e);
    },
    []
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : undefined,
  };

  return children({
    setNodeRef,
    style,
    isDragging,
    guardClick,
    handleProps: { ...attributes, ...listeners },
  });
}

function OptionCard({ option, item, drag, onOpen, reordering, hidden, onToggleHide, unitPrefs }) {
  const Icon = KIND_ICONS[option.kind];
  const summary = item && lastSummary(item, unitPrefs);
  return (
    <button
      ref={drag.setNodeRef}
      type="button"
      style={drag.style}
      className={`track-btn ${drag.isDragging ? 'dragging' : ''} ${hidden ? 'card-hidden' : ''}`}
      onClick={drag.guardClick(onOpen)}
    >
      <span className="icon-tile" style={tile(option.color)}>
        <Icon size={24} />
      </span>
      <span className="track-main">
        <div className="label">{option.label}</div>
        <div className="sub">{option.sub}</div>
      </span>
      {!reordering && (
        <span className="track-last">
          {item ? (
            <>
              <div className="track-last-label">Last {option.label.toLowerCase()}</div>
              {summary && <div className="track-last-value" style={{ color: option.color }}>{summary}</div>}
              <div className="track-last-time">{timeAgo(item.when)}</div>
            </>
          ) : (
            <div className="track-last-empty">None yet</div>
          )}
        </span>
      )}
      {reordering && <HideToggle hidden={hidden} onToggle={onToggleHide} />}
      {reordering && <DragHandle handleProps={drag.handleProps} />}
    </button>
  );
}

export default function Track() {
  const [open, setOpen] = useState(null);
  const [last, setLast] = useState({}); // kind -> most recent entry
  const notify = useToast();
  const { subjectType, selectedBaby, selectedId, selectedCaregiver } = useBaby();
  const unitPrefs = useSettings();

  const isCaregiver = subjectType === 'caregiver';
  const caregiverId = selectedCaregiver?.id;
  const subjectName = isCaregiver ? selectedCaregiver?.name : selectedBaby?.name;
  // Caregivers track a limited set (medications, temperature, blood pressure);
  // babies track everything except the caregiver-only kinds.
  const options = isCaregiver
    ? OPTIONS.filter((o) => CAREGIVER_KINDS.includes(o.kind))
    : OPTIONS.filter((o) => !o.caregiverOnly);

  // Card order is user-customizable (drag to reorder) and persisted. Caregivers
  // only see the medication card, so reordering applies to the baby view.
  const [order, setOrder] = useState(loadOrder);
  // Cards the user has hidden, scoped to the current subject type (see HIDDEN_KEY).
  // Hidden cards drop off this view and out of the history/timeline filter until
  // shown again. Reloaded below when switching between a baby and a caregiver.
  const hiddenScope = isCaregiver ? 'caregiver' : 'baby';
  const [hidden, setHidden] = useState(() => loadHidden(hiddenScope));
  useEffect(() => {
    setHidden(loadHidden(hiddenScope));
  }, [hiddenScope]);
  // Reorder mode is off by default: the drag handles and hide toggles only appear
  // after the user taps "Reorder Cards", so normal taps open a card without a grip
  // or eye in the way.
  const [reordering, setReordering] = useState(false);
  const availableKinds = isCaregiver ? CAREGIVER_KINDS : DEFAULT_ORDER;
  const orderedKinds = [
    ...order.filter((k) => availableKinds.includes(k)),
    ...availableKinds.filter((k) => !order.includes(k)), // newly added kinds fall in last
  ];
  // In reorder mode we show every card (so hidden ones can be turned back on);
  // otherwise hidden cards are omitted entirely.
  const visibleKinds = orderedKinds.filter((k) => !hidden.has(k));
  const renderedKinds = reordering ? orderedKinds : visibleKinds;
  // Nothing to reorder with a single card (e.g. caregivers only see medication),
  // so the toggle and handles never show there. Based on the full set so the
  // control stays available to restore hidden cards.
  const canReorder = orderedKinds.length > 1;
  const showHandles = reordering && canReorder;

  const toggleHide = (kind) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      try {
        const map = loadHiddenMap();
        map[hiddenScope] = [...next];
        localStorage.setItem(HIDDEN_KEY, JSON.stringify(map));
      } catch {
        /* ignore storage failures */
      }
      return next;
    });

  // Drag begins after a short press-and-hold (see SENSOR_OPTIONS).
  const sensors = useSensors(useSensor(PointerSensor, SENSOR_OPTIONS));

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = orderedKinds.indexOf(active.id);
    const newIndex = orderedKinds.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(orderedKinds, oldIndex, newIndex);
    setOrder(next);
    if (!isCaregiver) {
      try {
        localStorage.setItem(ORDER_KEY, JSON.stringify(next));
      } catch {
        /* ignore storage failures */
      }
    }
  };

  // The timeline is sorted newest-first, so the first item seen per kind is its
  // latest. Used to show "last feed / pump / …" on each card.
  const loadLast = useCallback(() => {
    (isCaregiver ? api.caregiverTimeline(caregiverId) : api.timeline(selectedId))
      .then((items) => {
        const map = {};
        for (const it of items) if (!map[it.kind]) map[it.kind] = it;
        setLast(map);
      })
      .catch(() => {}); // non-critical: cards still work without the summary
  }, [isCaregiver, caregiverId, selectedId]);

  useEffect(() => {
    setLast({});
    loadLast();
  }, [loadLast]);

  // Sleep flows:
  //  - tapping the card opens a chooser (start a live timer, back-date a nap
  //    that's already under way, or enter it manually)
  //  - the live timer's Stop opens the form pre-filled so the nap can be adjusted
  //    and commented before it's saved.
  const [napChoice, setNapChoice] = useState(null); // null | 'choose' | 'ago'
  const [napAgo, setNapAgo] = useState(0); // minutes since the running nap began
  const [sleepForm, setSleepForm] = useState(null); // null | { entry } (entry null = manual create)
  const [napBusy, setNapBusy] = useState(false);

  // Starts a live (no end_time) nap. `minutesAgo` back-dates the start for a nap
  // that's already been going a while, so the card's timer picks up mid-nap.
  const startNapTimer = async (minutesAgo = 0) => {
    setNapBusy(true);
    try {
      const payload =
        minutesAgo > 0 ? { start_time: new Date(serverNow() - minutesAgo * 60000).toISOString() } : {};
      await api.createSleep(payload, selectedId);
      setNapChoice(null);
      setNapAgo(0);
      notify(minutesAgo > 0 ? `Nap started ${formatMinutes(minutesAgo * 60)} ago` : 'Nap started');
      await loadLast();
    } catch (e) {
      notify('Error: ' + e.message);
    } finally {
      setNapBusy(false);
    }
  };

  // Stop ends the nap immediately (so the live card stops ticking), then opens
  // the form on the now-finished nap to adjust the duration or add a comment.
  const stopNap = async () => {
    const nap = last.sleep;
    if (!nap || nap.end_time) return;
    setNapBusy(true);
    try {
      const stopped = await api.updateSleep(nap.id, {
        start_time: nap.start_time,
        end_time: new Date(serverNow()).toISOString(),
        comment: nap.comment ?? null,
      });
      await loadLast();
      setSleepForm({ entry: stopped });
    } catch (e) {
      notify('Error: ' + e.message);
    } finally {
      setNapBusy(false);
    }
  };

  // Period flows. A period spans days, so its start and its end are two separate
  // logs: tapping the card with none running opens the start form, and tapping
  // it while one is running asks whether this is the end or a symptom.
  //  - `last.period` is the newest period (from the timeline), so no end_time on
  //    it means one is currently running.
  const [periodChoice, setPeriodChoice] = useState(false);
  const [periodForm, setPeriodForm] = useState(null); // null | { mode: 'start' | 'end', entry }
  const [symptomOpen, setSymptomOpen] = useState(false);

  const currentPeriod = last.period && !last.period.end_time ? last.period : null;

  const openPeriod = () => {
    if (currentPeriod) setPeriodChoice(true);
    else setPeriodForm({ mode: 'start', entry: null });
  };

  const SleepIcon = KIND_ICONS.sleep;
  const PeriodIcon = KIND_ICONS.period;
  const PeriodEndIcon = KIND_ICONS.period_end;
  const SymptomIcon = KIND_ICONS.symptom;

  const active = options.find((o) => o.kind === open);
  const ActiveIcon = active && KIND_ICONS[active.kind];

  return (
    <div>
      <p className="section-title">
        {isCaregiver ? `What did ${subjectName ?? 'they'} take?` : `What happened with ${subjectName ?? 'baby'}?`}
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={renderedKinds} strategy={verticalListSortingStrategy}>
          <div className="track-grid">
            {renderedKinds.map((kind) =>
              kind === 'sleep' ? (
                <SortableTrackItem key="sleep" id="sleep">
                  {(drag) => (
                    <SleepCard
                      sleep={last.sleep}
                      onStart={() => {
                        setNapAgo(0);
                        setNapChoice('choose');
                      }}
                      onStop={stopNap}
                      busy={napBusy}
                      drag={drag}
                      reordering={showHandles}
                      hidden={hidden.has('sleep')}
                      onToggleHide={() => toggleHide('sleep')}
                    />
                  )}
                </SortableTrackItem>
              ) : kind === 'period' ? (
                <SortableTrackItem key="period" id="period">
                  {(drag) => (
                    <PeriodCard
                      period={last.period}
                      onOpen={openPeriod}
                      drag={drag}
                      reordering={showHandles}
                      hidden={hidden.has('period')}
                      onToggleHide={() => toggleHide('period')}
                    />
                  )}
                </SortableTrackItem>
              ) : (
                <SortableTrackItem key={kind} id={kind}>
                  {(drag) => (
                    <OptionCard
                      option={OPTION_BY_KIND[kind]}
                      item={last[kind]}
                      drag={drag}
                      onOpen={() => setOpen(kind)}
                      reordering={showHandles}
                      hidden={hidden.has(kind)}
                      onToggleHide={() => toggleHide(kind)}
                      unitPrefs={unitPrefs}
                    />
                  )}
                </SortableTrackItem>
              )
            )}
          </div>
        </SortableContext>
      </DndContext>

      {canReorder && (
        <>
          <button
            type="button"
            className="reorder-toggle"
            aria-pressed={reordering}
            onClick={() => setReordering((r) => !r)}
          >
            {reordering ? 'Done' : 'Reorder or Hide Cards'}
          </button>
          {reordering && (
            <p className="reorder-hint">
              Drag the grip to reorder. Tap the eye to hide a card — hidden cards drop off this
              screen and the history &amp; timeline filters.
            </p>
          )}
        </>
      )}

      {active && (
        <Modal
          title={`${active.label} · ${subjectName ?? ''}`}
          icon={<ActiveIcon size={20} color={active.color} />}
          onClose={() => setOpen(null)}
        >
          <active.Form
            babyId={isCaregiver ? undefined : selectedId}
            caregiverId={isCaregiver ? selectedCaregiver?.id : undefined}
            notify={notify}
            onCancel={() => setOpen(null)}
            onSaved={() => {
              setOpen(null);
              loadLast();
            }}
          />
        </Modal>
      )}

      {napChoice && (
        <Modal
          title={`Sleep · ${subjectName ?? ''}`}
          icon={<SleepIcon size={20} color="var(--c-sleep)" />}
          onClose={() => setNapChoice(null)}
        >
          {napChoice === 'choose' ? (
            <>
              <p className="modal-prompt">How do you want to log this nap?</p>
              <button className="btn btn-primary" disabled={napBusy} onClick={() => startNapTimer()}>
                <PlayFill size={15} /> {napBusy ? 'Starting…' : 'Start a nap timer'}
              </button>
              <button className="btn btn-ghost" disabled={napBusy} onClick={() => setNapChoice('ago')}>
                <ClockHistory size={15} /> Nap already in progress
              </button>
              <button
                className="btn btn-ghost"
                disabled={napBusy}
                onClick={() => {
                  setNapChoice(null);
                  setSleepForm({ entry: null });
                }}
              >
                <Pencil size={15} /> Enter manually
              </button>
            </>
          ) : (
            <>
              <p className="modal-prompt">How long ago did the nap start?</p>
              <div className="field">
                <ElapsedField value={napAgo} onChange={setNapAgo} />
              </div>
              <div className="field">
                <label>
                  {napAgo > 0
                    ? `Started at ${formatTime(new Date(serverNow() - napAgo * 60000).toISOString())} — napping ${formatMinutes(napAgo * 60)}`
                    : 'Pick how long the nap has been running'}
                </label>
              </div>
              <button
                className="btn btn-primary"
                disabled={napBusy || napAgo <= 0}
                onClick={() => startNapTimer(napAgo)}
              >
                <PlayFill size={15} /> {napBusy ? 'Starting…' : 'Start nap'}
              </button>
              <button className="btn btn-ghost" disabled={napBusy} onClick={() => setNapChoice('choose')}>
                Back
              </button>
            </>
          )}
        </Modal>
      )}

      {periodChoice && (
        <Modal
          title={`Period · ${subjectName ?? ''}`}
          icon={<PeriodIcon size={20} color="var(--c-period)" />}
          onClose={() => setPeriodChoice(false)}
        >
          <p className="modal-prompt">
            {currentPeriod &&
              `Day ${periodDay(currentPeriod)}, started ${formatDayHalf(currentPeriod.start_time, currentPeriod.start_half)}.`}{' '}
            What are you logging?
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setPeriodChoice(false);
              setPeriodForm({ mode: 'end', entry: currentPeriod });
            }}
          >
            <PeriodEndIcon size={15} /> Log period end
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setPeriodChoice(false);
              setSymptomOpen(true);
            }}
          >
            <SymptomIcon size={15} /> Log a symptom
          </button>
        </Modal>
      )}

      {periodForm && (
        <Modal
          title={periodForm.mode === 'end' ? `Period end · ${subjectName ?? ''}` : `Period · ${subjectName ?? ''}`}
          icon={
            periodForm.mode === 'end' ? (
              <PeriodEndIcon size={20} color="var(--c-period)" />
            ) : (
              <PeriodIcon size={20} color="var(--c-period)" />
            )
          }
          onClose={() => setPeriodForm(null)}
        >
          <PeriodForm
            caregiverId={caregiverId}
            mode={periodForm.mode}
            entry={periodForm.entry}
            notify={notify}
            onCancel={() => setPeriodForm(null)}
            onSaved={() => {
              setPeriodForm(null);
              loadLast();
            }}
          />
        </Modal>
      )}

      {symptomOpen && (
        <Modal
          title={`Symptom · ${subjectName ?? ''}`}
          icon={<SymptomIcon size={20} color="var(--c-symptom)" />}
          onClose={() => setSymptomOpen(false)}
        >
          <SymptomForm
            caregiverId={caregiverId}
            notify={notify}
            onCancel={() => setSymptomOpen(false)}
            onSaved={() => {
              setSymptomOpen(false);
              loadLast();
            }}
          />
        </Modal>
      )}

      {sleepForm && (
        <Modal
          title={sleepForm.entry ? `Stop nap · ${subjectName ?? ''}` : `Sleep · ${subjectName ?? ''}`}
          icon={<SleepIcon size={20} color="var(--c-sleep)" />}
          onClose={() => setSleepForm(null)}
        >
          <SleepForm
            babyId={selectedId}
            entry={sleepForm.entry}
            notify={notify}
            onCancel={() => setSleepForm(null)}
            onSaved={() => {
              setSleepForm(null);
              loadLast();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
