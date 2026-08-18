import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { toLocalInput, fromLocalInput, nowLocalInput, SYMPTOM_SEVERITIES } from '../utils.js';
import DateTimeField from '../components/DateTimeField.jsx';
import { useDirty, useRequestClose } from '../components/Modal.jsx';
import { useFutureEntryConfirm } from '../components/useFutureEntryConfirm.jsx';

const CUSTOM = '__custom__';

// A symptom logged at a moment in time. Which period it belongs to is worked out
// server-side from the timestamp, so there's nothing to pick here — logging one
// while a period is running files it under that period automatically.
export default function SymptomForm({ onSaved, onCancel, notify, caregiverId, entry }) {
  const isEdit = !!entry;
  const [types, setTypes] = useState([]); // catalog
  const [selected, setSelected] = useState('');
  const [customName, setCustomName] = useState(entry?.name ?? '');
  const [time, setTime] = useState(entry ? toLocalInput(entry.time) : nowLocalInput());
  const [severity, setSeverity] = useState(entry?.severity ?? 'mild');
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(!isEdit);
  const { requestFutureConfirm, futureConfirm } = useFutureEntryConfirm();

  useEffect(() => {
    api
      .listSymptomTypes()
      .then((list) => {
        setTypes(list);
        if (isEdit) {
          const match = list.find((t) => t.name.toLowerCase() === entry.name.toLowerCase());
          setSelected(match ? String(match.id) : CUSTOM);
          setReady(true);
        }
      })
      .catch((e) => notify?.('Error: ' + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCustom = selected === CUSTOM;
  const resolvedName = isCustom ? customName.trim() : types.find((t) => String(t.id) === selected)?.name?.trim() ?? '';

  const requestClose = useRequestClose();
  const sig = [resolvedName, severity, comment, time].join('|');
  const initialSig = useRef(null);
  useEffect(() => {
    if (ready && initialSig.current === null) initialSig.current = sig;
  }, [ready, sig]);
  useDirty(ready && initialSig.current !== null && sig !== initialSig.current);

  const valid = resolvedName !== '';

  const save = async () => {
    if (!valid) return;
    const timeIso = fromLocalInput(time);
    if (!(await requestFutureConfirm([timeIso]))) return;
    setSaving(true);
    try {
      await api.createSymptomType({ name: resolvedName });
      const payload = {
        name: resolvedName,
        severity,
        time: timeIso,
        comment: comment.trim() || null,
      };
      if (isEdit) await api.updatePeriodSymptom(entry.id, payload);
      else await api.createPeriodSymptom(payload, caregiverId);
      notify?.(isEdit ? 'Symptom updated' : 'Symptom saved');
      onSaved?.();
    } catch (e) {
      notify?.('Error: ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="field">
        <label>Symptom</label>
        <select className="select" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="" disabled>
            Choose a symptom…
          </option>
          {types.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
          <option value={CUSTOM}>+ Add new symptom…</option>
        </select>
      </div>

      {isCustom && (
        <div className="field">
          <label>New symptom</label>
          <input
            type="text"
            value={customName}
            placeholder="e.g. Joint aches"
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
        <label>Severity</label>
        <div className="segmented">
          {SYMPTOM_SEVERITIES.map((s) => (
            <button key={s.value} type="button" className={severity === s.value ? 'active' : ''} onClick={() => setSeverity(s.value)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Comment</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What it felt like, what helped?" />
      </div>

      <button className="btn btn-primary" disabled={saving || !valid} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save symptom'}
      </button>
      <button className="btn btn-ghost" onClick={requestClose}>
        Cancel
      </button>
      {futureConfirm}
    </div>
  );
}
