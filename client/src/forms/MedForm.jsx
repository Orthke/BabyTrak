import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { toLocalInput, fromLocalInput, nowLocalInput } from '../utils.js';
import DateTimeField from '../components/DateTimeField.jsx';
import { useDirty, useRequestClose } from '../components/Modal.jsx';

const UNITS = ['pills', 'mg', 'drops', 'ml'];
const CUSTOM = '__custom__';

export default function MedForm({ onSaved, onCancel, notify, babyId, caregiverId, entry }) {
  const isEdit = !!entry;
  const forCaregiver = !!caregiverId;
  const category = forCaregiver ? 'caregiver' : 'baby';
  const [meds, setMeds] = useState([]); // catalog
  const [selected, setSelected] = useState(''); // medication id, or CUSTOM
  const [customName, setCustomName] = useState(isEdit ? entry.name : '');
  const [time, setTime] = useState(entry ? toLocalInput(entry.time) : nowLocalInput());
  const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount) : '');
  const [unit, setUnit] = useState(entry?.unit ?? (forCaregiver ? 'pills' : 'ml'));
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(!isEdit); // create mode is ready immediately

  // Load the dropdown catalog (scoped to baby vs. caregiver meds), then (in edit)
  // match the saved name to an entry.
  useEffect(() => {
    api
      .listMedications(category)
      .then((list) => {
        setMeds(list);
        if (isEdit) {
          const match = list.find((m) => m.name.toLowerCase() === entry.name.toLowerCase());
          if (match) setSelected(String(match.id));
          else setSelected(CUSTOM); // saved name isn't in the catalog → treat as custom
          setReady(true);
        }
      })
      .catch((e) => notify?.('Error: ' + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Picking a preset pre-selects its usual unit; switching to custom resets.
  const onSelect = (val) => {
    setSelected(val);
    if (val === CUSTOM || val === '') return;
    const med = meds.find((m) => String(m.id) === val);
    if (med?.default_unit && UNITS.includes(med.default_unit)) setUnit(med.default_unit);
  };

  const isCustom = selected === CUSTOM;
  const resolvedName = isCustom ? customName.trim() : meds.find((m) => String(m.id) === selected)?.name ?? '';

  const requestClose = useRequestClose();
  // Dirty = changed from how the form opened. Captured once the catalog has
  // loaded so the async name→id match doesn't register as an edit.
  const sig = [resolvedName, amount, unit, comment, time].join('|');
  const initialSig = useRef(null);
  useEffect(() => {
    if (ready && initialSig.current === null) initialSig.current = sig;
  }, [ready, sig]);
  useDirty(ready && initialSig.current !== null && sig !== initialSig.current);

  const valid = resolvedName !== '';

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      // A new custom medication is persisted to the catalog so it's reusable.
      if (isCustom) {
        await api.createMedication({ name: resolvedName, default_unit: unit, category });
      }
      const payload = {
        name: resolvedName,
        amount: amount === '' ? null : Number(amount),
        unit,
        time: fromLocalInput(time),
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
        <select className="select" value={selected} onChange={(e) => onSelect(e.target.value)}>
          <option value="" disabled>
            Choose a medication…
          </option>
          {meds.map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.name}
            </option>
          ))}
          <option value={CUSTOM}>+ Add custom medication…</option>
        </select>
      </div>

      {isCustom && (
        <div className="field">
          <label>Custom medication name</label>
          <input
            type="text"
            value={customName}
            placeholder="e.g. Children's Benadryl"
            onChange={(e) => setCustomName(e.target.value)}
            autoFocus
          />
        </div>
      )}

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
    </div>
  );
}
