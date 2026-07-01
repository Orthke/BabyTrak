import { useState, useRef } from 'react';
import { api } from '../api.js';
import { toLocalInput, fromLocalInput, nowLocalInput, TEMP_METHODS } from '../utils.js';
import DateTimeField from '../components/DateTimeField.jsx';
import { useDirty, useRequestClose } from '../components/Modal.jsx';

const UNITS = ['F', 'C'];

const toF = (c) => (c * 9) / 5 + 32;
const toC = (f) => ((f - 32) * 5) / 9;

export default function TemperatureForm({ onSaved, onCancel, notify, babyId, caregiverId, entry }) {
  const isEdit = !!entry;
  const forCaregiver = !!caregiverId;
  const [time, setTime] = useState(entry ? toLocalInput(entry.time) : nowLocalInput());
  const [temp, setTemp] = useState(entry?.temp != null ? String(entry.temp) : '');
  const [unit, setUnit] = useState(entry?.unit ?? 'F');
  const [method, setMethod] = useState(entry?.method ?? 'oral');
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);

  // Switching units converts the entered value so it stays the same reading.
  const changeUnit = (next) => {
    if (next === unit) return;
    if (temp !== '' && Number.isFinite(Number(temp))) {
      const converted = next === 'C' ? toC(Number(temp)) : toF(Number(temp));
      setTemp(String(+converted.toFixed(1)));
    }
    setUnit(next);
  };

  const requestClose = useRequestClose();
  const sig = [time, temp, unit, method, comment].join('|');
  const initialSig = useRef(sig);
  useDirty(sig !== initialSig.current);

  const valid = temp !== '' && Number.isFinite(Number(temp));

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const payload = {
        time: fromLocalInput(time),
        temp: Number(temp),
        unit,
        method,
        comment: comment.trim() || null,
      };
      if (isEdit) await api.updateTemperature(entry.id, payload);
      else if (forCaregiver) await api.createCaregiverTemperature(payload, caregiverId);
      else await api.createTemperature(payload, babyId);
      notify?.(isEdit ? 'Temperature updated' : 'Temperature saved');
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
        <label>Temperature</label>
        <div className="row">
          <input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={temp}
            placeholder={unit === 'C' ? '37.0' : '98.6'}
            onChange={(e) => setTemp(e.target.value)}
            style={{ flex: 2 }}
          />
          <div className="segmented" style={{ flex: 1 }}>
            {UNITS.map((u) => (
              <button key={u} type="button" className={unit === u ? 'active' : ''} onClick={() => changeUnit(u)}>
                °{u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <label>Method</label>
        <div className="segmented">
          {TEMP_METHODS.map((m) => (
            <button key={m.value} type="button" className={method === m.value ? 'active' : ''} onClick={() => setMethod(m.value)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Comment</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Symptoms, anything to note?"
        />
      </div>

      <button className="btn btn-primary" disabled={saving || !valid} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save temperature'}
      </button>
      <button className="btn btn-ghost" onClick={requestClose}>
        Cancel
      </button>
    </div>
  );
}
