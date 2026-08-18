import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { toLocalInput, fromLocalInput, nowLocalInput } from '../utils.js';
import DateTimeField from '../components/DateTimeField.jsx';
import { useDirty, useRequestClose } from '../components/Modal.jsx';
import { useFutureEntryConfirm } from '../components/useFutureEntryConfirm.jsx';

const UNITS = ['pills', 'mg', 'drops', 'ml'];
export default function MedForm({ onSaved, onCancel, notify, babyId, caregiverId, entry }) {
  const isEdit = !!entry;
  const forCaregiver = !!caregiverId;
  const category = forCaregiver ? 'caregiver' : 'baby';
  const [meds, setMeds] = useState([]); // catalog
  const [name, setName] = useState(entry?.name ?? '');
  const [time, setTime] = useState(entry ? toLocalInput(entry.time) : nowLocalInput());
  const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount) : '');
  const [unit, setUnit] = useState(entry?.unit ?? (forCaregiver ? 'pills' : 'ml'));
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const { requestFutureConfirm, futureConfirm } = useFutureEntryConfirm();

  const suggestionsId = `med-suggestions-${category}`;

  useEffect(() => {
    api
      .listMedications(category)
      .then((list) => setMeds(list))
      .catch((e) => notify?.('Error: ' + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncUnitFromName = (nextName) => {
    const match = meds.find((m) => m.name.toLowerCase() === nextName.trim().toLowerCase());
    if (match?.default_unit && UNITS.includes(match.default_unit)) setUnit(match.default_unit);
  };

  const requestClose = useRequestClose();
  const sig = [name.trim(), amount, unit, comment, time].join('|');
  const initialSig = useRef(sig);
  useDirty(sig !== initialSig.current);

  const resolvedName = name.trim();
  const valid = resolvedName !== '';

  const save = async () => {
    if (!valid) return;
    const timeIso = fromLocalInput(time);
    if (!(await requestFutureConfirm([timeIso]))) return;
    setSaving(true);
    try {
      await api.createMedication({ name: resolvedName, default_unit: unit, category });
      const payload = {
        name: resolvedName,
        amount: amount === '' ? null : Number(amount),
        unit,
        time: timeIso,
        comment: comment.trim() || null,
      };
      if (isEdit) await api.updateMedDose(entry.id, payload);
      else if (forCaregiver) await api.createCaregiverMedDose(payload, caregiverId);
      else await api.createMedDose(payload, babyId);
      notify?.(isEdit ? 'Medication updated' : 'Medication saved');
      onSaved?.();
    } catch (e) {
      notify?.('Error: ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="field">
        <label>Medication</label>
        <input
          type="text"
          list={suggestionsId}
          value={name}
          placeholder="e.g. Children's Benadryl"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => syncUnitFromName(name)}
          autoFocus
        />
        <datalist id={suggestionsId}>
          {meds.map((m) => (
            <option key={m.id} value={m.name} />
          ))}
        </datalist>
      </div>

      <div className="field">
        <label>Time</label>
        <DateTimeField value={time} onChange={setTime} />
      </div>

      <div className="field">
        <label>Dose</label>
        <div className="row">
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={amount}
            placeholder="0"
            onChange={(e) => setAmount(e.target.value)}
            style={{ flex: 2 }}
          />
          <div className="segmented" style={{ flex: 1.6 }}>
            {UNITS.map((u) => (
              <button key={u} type="button" className={unit === u ? 'active' : ''} onClick={() => setUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <label>Comment</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reason, reaction, anything to note?" />
      </div>

      <button className="btn btn-primary" disabled={saving || !valid} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save medication'}
      </button>
      <button className="btn btn-ghost" onClick={requestClose}>
        Cancel
      </button>
      {futureConfirm}
    </div>
  );
}
