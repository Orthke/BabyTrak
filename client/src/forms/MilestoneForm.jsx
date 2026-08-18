import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { toLocalInput, fromLocalInput, nowLocalInput } from '../utils.js';
import DateTimeField from '../components/DateTimeField.jsx';
import { useDirty, useRequestClose } from '../components/Modal.jsx';
import { useFutureEntryConfirm } from '../components/useFutureEntryConfirm.jsx';

export default function MilestoneForm({ onSaved, onCancel, notify, babyId, entry }) {
  const isEdit = !!entry;
  const [types, setTypes] = useState([]); // catalog
  const [name, setName] = useState(entry?.name ?? '');
  const [time, setTime] = useState(entry ? toLocalInput(entry.time) : nowLocalInput());
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const { requestFutureConfirm, futureConfirm } = useFutureEntryConfirm();
  const suggestionsId = 'milestone-suggestions';

  useEffect(() => {
    api
      .listMilestoneTypes()
      .then((list) => setTypes(list))
      .catch((e) => notify?.('Error: ' + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestClose = useRequestClose();
  const sig = [name.trim(), comment, time].join('|');
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
        <input
          type="text"
          list={suggestionsId}
          value={name}
          placeholder="e.g. First time at the beach"
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <datalist id={suggestionsId}>
          {types.map((m) => (
            <option key={m.id} value={m.name} />
          ))}
        </datalist>
      </div>

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
