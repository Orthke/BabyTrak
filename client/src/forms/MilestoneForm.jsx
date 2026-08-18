import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { toLocalInput, fromLocalInput, nowLocalInput } from '../utils.js';
import DateTimeField from '../components/DateTimeField.jsx';
import { useDirty, useRequestClose } from '../components/Modal.jsx';
import { useFutureEntryConfirm } from '../components/useFutureEntryConfirm.jsx';

const CUSTOM = '__custom__';

export default function MilestoneForm({ onSaved, onCancel, notify, babyId, entry }) {
  const isEdit = !!entry;
  const [types, setTypes] = useState([]); // catalog
  const [selected, setSelected] = useState('');
  const [customName, setCustomName] = useState(entry?.name ?? '');
  const [time, setTime] = useState(entry ? toLocalInput(entry.time) : nowLocalInput());
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(!isEdit);
  const { requestFutureConfirm, futureConfirm } = useFutureEntryConfirm();

  useEffect(() => {
    api
      .listMilestoneTypes()
      .then((list) => {
        setTypes(list);
        if (isEdit) {
          const match = list.find((m) => m.name.toLowerCase() === entry.name.toLowerCase());
          setSelected(match ? String(match.id) : CUSTOM);
          setReady(true);
        }
      })
      .catch((e) => notify?.('Error: ' + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCustom = selected === CUSTOM;
  const resolvedName = isCustom ? customName.trim() : types.find((m) => String(m.id) === selected)?.name?.trim() ?? '';

  const requestClose = useRequestClose();
  const sig = [resolvedName, comment, time].join('|');
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
      await api.createMilestoneType({ name: resolvedName });
      const payload = {
        name: resolvedName,
        time: timeIso,
        comment: comment.trim() || null,
      };
      if (isEdit) await api.updateMilestone(entry.id, payload);
      else await api.createMilestone(payload, babyId);
      notify?.(isEdit ? 'Milestone updated' : 'Milestone saved');
      onSaved?.();
    } catch (e) {
      notify?.('Error: ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="field">
        <label>Milestone</label>
        <select className="select" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="" disabled>
            Choose a milestone…
          </option>
          {types.map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.name}
            </option>
          ))}
          <option value={CUSTOM}>+ Add new milestone…</option>
        </select>
      </div>

      {isCustom && (
        <div className="field">
          <label>New milestone</label>
          <input
            type="text"
            value={customName}
            placeholder="e.g. First time at the beach"
            onChange={(e) => setCustomName(e.target.value)}
            autoFocus
          />
        </div>
      )}

      <div className="field">
        <label>When</label>
        <DateTimeField value={time} onChange={setTime} />
      </div>

      <div className="field">
        <label>Comment</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What happened? Anything to remember?" />
      </div>

      <button className="btn btn-primary" disabled={saving || !valid} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save milestone'}
      </button>
      <button className="btn btn-ghost" onClick={requestClose}>
        Cancel
      </button>
      {futureConfirm}
    </div>
  );
}
