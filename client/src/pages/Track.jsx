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
import { timeAgo, formatMinutes, measurementSummary, formatTemp, formatBP } from '../utils.js';
import Modal from '../components/Modal.jsx';
import FeedForm from '../forms/FeedForm.jsx';
import PumpForm from '../forms/PumpForm.jsx';
import DiaperForm from '../forms/DiaperForm.jsx';
import MedForm from '../forms/MedForm.jsx';
import MilestoneForm from '../forms/MilestoneForm.jsx';
import MeasurementForm from '../forms/MeasurementForm.jsx';
import TemperatureForm from '../forms/TemperatureForm.jsx';
import BloodPressureForm from '../forms/BloodPressureForm.jsx';
import SleepForm from '../forms/SleepForm.jsx';
import SleepCard from '../components/SleepCard.jsx';
import DragHandle from '../components/DragHandle.jsx';
import { useToast } from '../components/Toast.jsx';
import { useBaby } from '../context/BabyContext.jsx';
import { KIND_ICONS, PlayFill, Pencil } from '../icons.jsx';

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
];

// Kinds a caregiver can track (they don't have feeds, diapers, etc.).
const CAREGIVER_KINDS = ['med', 'temperature', 'bp'];

function tile(color) {
  return { background: `color-mix(in srgb, ${color} 14%, white)`, color };
}

// One-line summary of the most recent entry of a kind, shown on the right of its
// card: volume for feeds/pumps, what was in the diaper, or the medication name.
function lastSummary(item) {
  switch (item.kind) {
    case 'feed': {
      if (item.amount != null) return `${item.amount} ${item.unit}`;
      const secs = (item.left_seconds || 0) + (item.right_seconds || 0);
      return secs ? formatMinutes(secs) : null;
    }
    case 'pump':
      return item.amount != null ? `${item.amount} ${item.unit}` : null;
    case 'diaper':
      if (item.wet && item.dirty) return 'Wet & dirty';
      if (item.wet) return 'Wet';
      if (item.dirty) return 'Dirty';
      return null;
    case 'med':
    case 'milestone':
      return item.name;
    case 'measurement':
      return measurementSummary(item);
    case 'temperature':
      return formatTemp(item.temp, item.unit);
    case 'bp':
      return formatBP(item.systolic, item.diastolic);
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

function loadOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || 'null');
    if (Array.isArray(saved) && saved.every((k) => typeof k === 'string')) return saved;
  } catch {
    /* ignore malformed storage */
  }
  return DEFAULT_ORDER;
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

function OptionCard({ option, item, drag, onOpen, reordering }) {
  const Icon = KIND_ICONS[option.kind];
  const summary = item && lastSummary(item);
  return (
    <button
      ref={drag.setNodeRef}
      type="button"
      style={drag.style}
      className={`track-btn ${drag.isDragging ? 'dragging' : ''}`}
      onClick={drag.guardClick(onOpen)}
    >
      <span className="icon-tile" style={tile(option.color)}>
        <Icon size={24} />
      </span>
      <span className="track-main">
        <div className="label">{option.label}</div>
        <div className="sub">{option.sub}</div>
      </span>
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
      {reordering && <DragHandle handleProps={drag.handleProps} />}
    </button>
  );
}

export default function Track() {
  const [open, setOpen] = useState(null);
  const [last, setLast] = useState({}); // kind -> most recent entry
  const notify = useToast();
  const { subjectType, selectedBaby, selectedId, selectedCaregiver } = useBaby();

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
  // Reorder mode is off by default: the drag handles only appear after the user
  // taps "Reorder Cards", so normal taps open a card without a grip in the way.
  const [reordering, setReordering] = useState(false);
  const availableKinds = isCaregiver ? CAREGIVER_KINDS : DEFAULT_ORDER;
  const orderedKinds = [
    ...order.filter((k) => availableKinds.includes(k)),
    ...availableKinds.filter((k) => !order.includes(k)), // newly added kinds fall in last
  ];
  // Nothing to reorder with a single card (e.g. caregivers only see medication),
  // so the toggle and handles never show there.
  const canReorder = orderedKinds.length > 1;
  const showHandles = reordering && canReorder;

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
  //  - tapping the card opens a chooser (start a live timer, or enter manually)
  //  - the live timer's Stop opens the form pre-filled so the nap can be adjusted
  //    and commented before it's saved.
  const [napChoice, setNapChoice] = useState(false);
  const [sleepForm, setSleepForm] = useState(null); // null | { entry } (entry null = manual create)
  const [napBusy, setNapBusy] = useState(false);

  const startNapTimer = async () => {
    setNapBusy(true);
    try {
      await api.createSleep({}, selectedId);
      setNapChoice(false);
      notify('Nap started');
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

  const SleepIcon = KIND_ICONS.sleep;

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
        <SortableContext items={orderedKinds} strategy={verticalListSortingStrategy}>
          <div className="track-grid">
            {orderedKinds.map((kind) =>
              kind === 'sleep' ? (
                <SortableTrackItem key="sleep" id="sleep">
                  {(drag) => (
                    <SleepCard
                      sleep={last.sleep}
                      onStart={() => setNapChoice(true)}
                      onStop={stopNap}
                      busy={napBusy}
                      drag={drag}
                      reordering={showHandles}
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
                    />
                  )}
                </SortableTrackItem>
              )
            )}
          </div>
        </SortableContext>
      </DndContext>

      {canReorder && (
        <button
          type="button"
          className="reorder-toggle"
          aria-pressed={reordering}
          onClick={() => setReordering((r) => !r)}
        >
          {reordering ? 'Done' : 'Reorder Cards'}
        </button>
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
          onClose={() => setNapChoice(false)}
        >
          <p className="modal-prompt">How do you want to log this nap?</p>
          <button className="btn btn-primary" disabled={napBusy} onClick={startNapTimer}>
            <PlayFill size={15} /> {napBusy ? 'Starting…' : 'Start a nap timer'}
          </button>
          <button
            className="btn btn-ghost"
            disabled={napBusy}
            onClick={() => {
              setNapChoice(false);
              setSleepForm({ entry: null });
            }}
          >
            <Pencil size={15} /> Enter manually
          </button>
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
