import { useState, useRef } from 'react';
import { api } from '../api.js';
import { toLocalInput, fromLocalInput, nowLocalInput } from '../utils.js';
import DateTimeField from '../components/DateTimeField.jsx';
import { useDirty, useRequestClose } from '../components/Modal.jsx';

export default function BloodPressureForm({ onSaved, onCancel, notify, babyId, caregiverId, entry }) {
  const isEdit = !!entry;
  const forCaregiver = !!caregiverId;
  const [time, setTime] = useState(entry ? toLocalInput(entry.time) : nowLocalInput());
  const [systolic, setSystolic] = useState(entry?.systolic != null ? String(entry.systolic) : '');
  const [diastolic, setDiastolic] = useState(entry?.diastolic != null ? String(entry.diastolic) : '');
  const [pulse, setPulse] = useState(entry?.pulse != null ? String(entry.pulse) : '');
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);

  const requestClose = useRequestClose();
  const sig = [time, systolic, diastolic, pulse, comment].join('|');
  const initialSig = useRef(sig);
  useDirty(sig !== initialSig.current);

  // Both numbers are required; pulse is optional.
  const valid =
    systolic !== '' && Number.isFinite(Number(systolic)) &&
    diastolic !== '' && Number.isFinite(Number(diastolic));

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const payload = {
        time: fromLocalInput(time),
        systolic: Number(systolic),
        diastolic: Number(diastolic),
        pulse: pulse === '' ? null : Number(pulse),
        comment: comment.trim() || null,
      };
      if (isEdit) await api.updateBloodPressure(entry.id, payload);
      else if (forCaregiver) await api.createCaregiverBloodPressure(payload, caregiverId);
      else await api.createBloodPressure(payload, babyId);
      notify?.(isEdit ? 'Blood pressure updated' : 'Blood pressure saved');
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
        <label>Blood pressure (mmHg)</label>
        <div className="row">
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={systolic}
            placeholder="120"
            aria-label="Systolic"
            onChange={(e) => setSystolic(e.target.value)}
            style={{ flex: 1 }}
          />
          <span style={{ fontWeight: 700, color: 'var(--c-muted)' }}>/</span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={diastolic}
            placeholder="80"
            aria-label="Diastolic"
            onChange={(e) => setDiastolic(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
      </div>

      <div className="field">
        <label>Pulse (bpm) · optional</label>
        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={pulse}
          placeholder="72"
          onChange={(e) => setPulse(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Comment</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Arm, position, anything to note?"
        />
      </div>

      <button className="btn btn-primary" disabled={saving || !valid} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save blood pressure'}
      </button>
      <button className="btn btn-ghost" onClick={requestClose}>
        Cancel
      </button>
    </div>
  );
}
