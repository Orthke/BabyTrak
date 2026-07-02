import { useState, useRef } from 'react';
import { api } from '../api.js';
import { toLocalInput, fromLocalInput, nowLocalInput, GLUCOSE_CONTEXTS, MGDL_PER_MMOL } from '../utils.js';
import DateTimeField from '../components/DateTimeField.jsx';
import { useDirty, useRequestClose } from '../components/Modal.jsx';

const UNITS = ['mg/dL', 'mmol/L'];

export default function BloodSugarForm({ onSaved, onCancel, notify, babyId, caregiverId, entry }) {
  const isEdit = !!entry;
  const forCaregiver = !!caregiverId;
  const [time, setTime] = useState(entry ? toLocalInput(entry.time) : nowLocalInput());
  const [value, setValue] = useState(entry?.value != null ? String(entry.value) : '');
  const [unit, setUnit] = useState(entry?.unit ?? 'mg/dL');
  const [context, setContext] = useState(entry?.context ?? 'random');
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);

  // Switching units converts the entered value so it stays the same reading.
  const changeUnit = (next) => {
    if (next === unit) return;
    if (value !== '' && Number.isFinite(Number(value))) {
      const converted = next === 'mmol/L' ? Number(value) / MGDL_PER_MMOL : Number(value) * MGDL_PER_MMOL;
      setValue(String(next === 'mmol/L' ? +converted.toFixed(1) : Math.round(converted)));
    }
    setUnit(next);
  };

  const requestClose = useRequestClose();
  const sig = [time, value, unit, context, comment].join('|');
  const initialSig = useRef(sig);
  useDirty(sig !== initialSig.current);

  const valid = value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const payload = {
        time: fromLocalInput(time),
        value: Number(value),
        unit,
        context,
        comment: comment.trim() || null,
      };
      if (isEdit) await api.updateBloodSugar(entry.id, payload);
      else if (forCaregiver) await api.createCaregiverBloodSugar(payload, caregiverId);
      else await api.createBloodSugar(payload, babyId);
      notify?.(isEdit ? 'Blood sugar updated' : 'Blood sugar saved');
      onSaved?.();
    } catch (e) {
      notify?.('Error: ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="field">
        <label>Time</label>
        <DateTimeField value={time} onChange={setTime} />
      </div>

      <div className="field">
        <label>Blood sugar</label>
        <div className="row">
          <input
            type="number"
            min="0"
            step={unit === 'mmol/L' ? '0.1' : '1'}
            inputMode="decimal"
            value={value}
            placeholder={unit === 'mmol/L' ? '5.3' : '95'}
            onChange={(e) => setValue(e.target.value)}
            style={{ flex: 2 }}
          />
          <div className="segmented" style={{ flex: 1.4 }}>
            {UNITS.map((u) => (
              <button key={u} type="button" className={unit === u ? 'active' : ''} onClick={() => changeUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <label>When</label>
        <div className="segmented segmented-wrap">
          {GLUCOSE_CONTEXTS.map((c) => (
            <button key={c.value} type="button" className={context === c.value ? 'active' : ''} onClick={() => setContext(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Comment</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Anything to note?"
        />
      </div>

      <button className="btn btn-primary" disabled={saving || !valid} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save blood sugar'}
      </button>
      <button className="btn btn-ghost" onClick={requestClose}>
        Cancel
      </button>
    </div>
  );
}
