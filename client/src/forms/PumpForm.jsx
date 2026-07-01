import { useState, useCallback, useRef } from 'react';
import DurationTimer from '../components/DurationTimer.jsx';
import DateTimeField from '../components/DateTimeField.jsx';
import { api } from '../api.js';
import { toLocalInput, fromLocalInput, nowLocalInput, formatDuration } from '../utils.js';
import { Stopwatch, Pencil } from '../icons.jsx';
import { useDirty, useRequestClose } from '../components/Modal.jsx';

export default function PumpForm({ onSaved, onCancel, notify, babyId, entry }) {
  const isEdit = !!entry;
  const [mode, setMode] = useState(isEdit ? 'manual' : 'timer'); // 'timer' | 'manual'
  const [start, setStart] = useState(entry ? toLocalInput(entry.start_time) : nowLocalInput());
  const [seconds, setSeconds] = useState(entry?.duration_seconds ?? 0);
  const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount) : '');
  const [unit, setUnit] = useState(entry?.unit ?? 'ml'); // 'ml' | 'oz'
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);

  const updateSeconds = useCallback((updater) => {
    setSeconds((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  const setManualMinutes = (minutes) => {
    const m = Math.max(0, Number(minutes) || 0);
    setSeconds(Math.round(m * 60));
  };

  const save = async () => {
    setSaving(true);
    try {
      const startIso = fromLocalInput(start);
      const endIso = new Date(new Date(startIso).getTime() + seconds * 1000).toISOString();
      const payload = {
        start_time: startIso,
        end_time: endIso,
        amount: amount === '' ? null : Number(amount),
        unit,
        duration_seconds: seconds,
        comment: comment.trim() || null,
      };
      if (isEdit) await api.updatePump(entry.id, payload);
      else await api.createPump(payload, babyId);
      notify?.(isEdit ? 'Pump updated' : 'Pump session saved');
      onSaved?.();
    } catch (e) {
      notify?.('Error: ' + e.message);
      setSaving(false);
    }
  };

  const valid = amount !== '' && Number(amount) > 0;

  const requestClose = useRequestClose();
  // Dirty = changed from how the form opened.
  const sig = [start, seconds, amount, unit, comment].join('|');
  const initialSig = useRef(sig);
  useDirty(sig !== initialSig.current);

  return (
    <div>
      <div className="field">
        <label>Start time</label>
        <DateTimeField value={start} onChange={setStart} />
      </div>

      <div className="field">
        <label>Duration</label>
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
          <DurationTimer value={seconds} onChange={updateSeconds} accent="var(--c-pump)" />
        </div>
      ) : (
        <div className="field">
          <label>Minutes</label>
          <input
            type="number"
            min="0"
            inputMode="decimal"
            value={seconds ? +(seconds / 60).toFixed(1) : ''}
            placeholder="0"
            onChange={(e) => setManualMinutes(e.target.value)}
          />
        </div>
      )}

      <div className="field">
        <label>Duration: {formatDuration(seconds)}</label>
      </div>

      <div className="field">
        <label>Volume collected</label>
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
      </div>

      <div className="field">
        <label>Comment</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Left, right, both? Anything to note?" />
      </div>

      <button className="btn btn-primary" disabled={saving || !valid} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save pump'}
      </button>
      <button className="btn btn-ghost" onClick={requestClose}>
        Cancel
      </button>
    </div>
  );
}
