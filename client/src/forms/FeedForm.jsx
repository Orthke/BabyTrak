import { useState, useCallback, useRef, useEffect } from 'react';
import BreastTimer from '../components/BreastTimer.jsx';
import DurationTimer from '../components/DurationTimer.jsx';
import DateTimeField from '../components/DateTimeField.jsx';
import { api } from '../api.js';
import { toLocalInput, fromLocalInput, nowLocalInput, formatDuration } from '../utils.js';
import { Stopwatch, Pencil } from '../icons.jsx';
import { FEED_TYPE_ICONS } from '../icons.jsx';
import { useDirty, useRequestClose } from '../components/Modal.jsx';

const TYPES = [
  { key: 'breast', label: 'Breast' },
  { key: 'bottle', label: 'Bottle' },
  { key: 'both', label: 'Both' },
];

export default function FeedForm({ onSaved, onCancel, notify, babyId, entry }) {
  const isEdit = !!entry;
  const [type, setType] = useState(entry?.type ?? 'breast'); // 'breast' | 'bottle' | 'both'
  const [start, setStart] = useState(entry ? toLocalInput(entry.start_time) : nowLocalInput());

  // breast portion
  const [mode, setMode] = useState(isEdit ? 'manual' : 'timer'); // 'timer' | 'manual'
  const [sides, setSides] = useState({ left: entry?.left_seconds ?? 0, right: entry?.right_seconds ?? 0 });

  // bottle portion
  const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount) : '');
  const [unit, setUnit] = useState(entry?.unit ?? 'ml');
  const [bottleMode, setBottleMode] = useState(isEdit ? 'manual' : 'timer'); // 'timer' | 'manual'
  const [bottleSeconds, setBottleSeconds] = useState(entry?.bottle_seconds ?? 0);

  // shared
  const [milkType, setMilkType] = useState(entry?.milk_type ?? 'breast');
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);

  // Most recent pump that recorded a volume — lets the user log "fed the bottle
  // we just pumped" without re-typing the amount.
  const [lastPump, setLastPump] = useState(null);
  useEffect(() => {
    if (babyId == null) return;
    let cancelled = false;
    api
      .listPumps(babyId)
      .then((pumps) => {
        if (cancelled) return;
        const withAmount = pumps
          .filter((p) => p.amount != null)
          .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
        setLastPump(withAmount[0] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [babyId]);

  const hasBreast = type === 'breast' || type === 'both';
  const hasBottle = type === 'bottle' || type === 'both';

  const updateSides = useCallback((updater) => {
    setSides((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  const setManualMinutes = (side, minutes) => {
    const m = Math.max(0, Number(minutes) || 0);
    setSides((prev) => ({ ...prev, [side]: Math.round(m * 60) }));
  };

  const updateBottleSeconds = useCallback((updater) => {
    setBottleSeconds((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  const setBottleManualMinutes = (minutes) => {
    setBottleSeconds(Math.round(Math.max(0, Number(minutes) || 0) * 60));
  };

  const totalSeconds = sides.left + sides.right;
  // A breast feed can be logged with zero time (an attempt to nurse that didn't
  // take); it shows as "Attempted to feed". Bottle still needs an amount.
  const breastOk = true;
  const bottleOk = !hasBottle || (amount !== '' && Number(amount) > 0);
  const valid = breastOk && bottleOk;

  const requestClose = useRequestClose();
  // Dirty = changed from how the form opened.
  const sig = [type, start, sides.left, sides.right, amount, unit, bottleSeconds, milkType, comment].join('|');
  const initialSig = useRef(sig);
  useDirty(sig !== initialSig.current);

  const save = async () => {
    setSaving(true);
    try {
      const startIso = fromLocalInput(start);
      const activeSeconds = (hasBreast ? totalSeconds : 0) + (hasBottle ? bottleSeconds : 0);
      const endIso =
        activeSeconds > 0 ? new Date(new Date(startIso).getTime() + activeSeconds * 1000).toISOString() : null;
      const payload = {
        type,
        start_time: startIso,
        end_time: endIso,
        left_seconds: hasBreast ? sides.left : 0,
        right_seconds: hasBreast ? sides.right : 0,
        bottle_seconds: hasBottle ? bottleSeconds : 0,
        amount: hasBottle && amount !== '' ? Number(amount) : null,
        unit,
        milk_type: milkType,
        comment: comment.trim() || null,
      };
      if (isEdit) await api.updateFeeding(entry.id, payload);
      else await api.createFeeding(payload, babyId);
      notify?.(isEdit ? 'Feed updated' : 'Feed saved');
      onSaved?.();
    } catch (e) {
      notify?.('Error: ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="field">
        <label>What kind of feed?</label>
        <div className="segmented">
          {TYPES.map((t) => {
            const Icon = FEED_TYPE_ICONS[t.key];
            return (
              <button key={t.key} type="button" className={type === t.key ? 'active' : ''} onClick={() => setType(t.key)}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <label>Start time</label>
        <DateTimeField value={start} onChange={setStart} />
      </div>

      {/* Breast portion */}
      {hasBreast && (
        <>
          <div className="field">
            <label>Nursing time</label>
            <div className="segmented">
              <button type="button" className={mode === 'timer' ? 'active' : ''} onClick={() => setMode('timer')}>
                <Stopwatch size={15} /> Timer
              </button>
              <button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>
                <Pencil size={15} /> Manual
              </button>
            </div>
          </div>

          {mode === 'timer' ? (
            <div className="field">
              <BreastTimer value={sides} onChange={updateSides} />
            </div>
          ) : (
            <div className="field">
              <div className="row">
                <div>
                  <label>Left (min)</label>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={sides.left ? +(sides.left / 60).toFixed(1) : ''}
                    placeholder="0"
                    onChange={(e) => setManualMinutes('left', e.target.value)}
                  />
                </div>
                <div>
                  <label>Right (min)</label>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={sides.right ? +(sides.right / 60).toFixed(1) : ''}
                    placeholder="0"
                    onChange={(e) => setManualMinutes('right', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="field">
            <label>Nursing total: {formatDuration(totalSeconds)}</label>
          </div>
        </>
      )}

      {/* Bottle portion */}
      {hasBottle && (
        <>
          <div className="field">
            <label>Bottle time</label>
            <div className="segmented">
              <button
                type="button"
                className={bottleMode === 'timer' ? 'active' : ''}
                onClick={() => setBottleMode('timer')}
              >
                <Stopwatch size={15} /> Timer
              </button>
              <button
                type="button"
                className={bottleMode === 'manual' ? 'active' : ''}
                onClick={() => setBottleMode('manual')}
              >
                <Pencil size={15} /> Manual
              </button>
            </div>
          </div>

          {bottleMode === 'timer' ? (
            <div className="field">
              <DurationTimer value={bottleSeconds} onChange={updateBottleSeconds} accent="var(--c-bottle)" />
            </div>
          ) : (
            <div className="field">
              <label>Minutes</label>
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={bottleSeconds ? +(bottleSeconds / 60).toFixed(1) : ''}
                placeholder="0"
                onChange={(e) => setBottleManualMinutes(e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label>Bottle time: {formatDuration(bottleSeconds)}</label>
          </div>

          <div className="field">
            <label>Bottle amount</label>
            <div className="row">
              <input
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                value={amount}
                placeholder="0"
                onChange={(e) => setAmount(e.target.value)}
                style={{ flex: 2 }}
              />
              <div className="segmented" style={{ flex: 1 }}>
                <button type="button" className={unit === 'ml' ? 'active' : ''} onClick={() => setUnit('ml')}>
                  ml
                </button>
                <button type="button" className={unit === 'oz' ? 'active' : ''} onClick={() => setUnit('oz')}>
                  oz
                </button>
              </div>
            </div>
            {lastPump && (
              <button
                type="button"
                className="btn btn-ghost use-last-pump"
                onClick={() => {
                  setAmount(String(lastPump.amount));
                  setUnit(lastPump.unit);
                }}
              >
                Used last pump volume ({lastPump.amount} {lastPump.unit})
              </button>
            )}
          </div>
        </>
      )}

      <div className="field">
        <label>{hasBottle ? 'Bottle milk' : 'Milk type'}</label>
        <div className="segmented">
          <button type="button" className={milkType === 'breast' ? 'active' : ''} onClick={() => setMilkType('breast')}>
            Breast milk
          </button>
          <button type="button" className={milkType === 'formula' ? 'active' : ''} onClick={() => setMilkType('formula')}>
            Formula
          </button>
        </div>
      </div>

      <div className="field">
        <label>Comment</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything to note?" />
      </div>

      <button className="btn btn-primary" disabled={saving || !valid} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save feed'}
      </button>
      <button className="btn btn-ghost" onClick={requestClose}>
        Cancel
      </button>
    </div>
  );
}
