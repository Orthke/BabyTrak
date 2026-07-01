import { useState, useRef } from 'react';
import DateTimeField from '../components/DateTimeField.jsx';
import { api, serverNow } from '../api.js';
import { toLocalInput, fromLocalInput, nowLocalInput, formatDuration } from '../utils.js';
import { useDirty, useRequestClose } from '../components/Modal.jsx';

export default function SleepForm({ onSaved, onCancel, notify, babyId, entry }) {
  const isEdit = !!entry;
  const [start, setStart] = useState(entry ? toLocalInput(entry.start_time) : nowLocalInput());
  // An in-progress nap (no end_time yet) defaults its end to now so the duration
  // reflects how long it's been running; otherwise use the recorded end.
  const [end, setEnd] = useState(
    entry ? toLocalInput(entry.end_time ?? serverNow()) : nowLocalInput()
  );
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);

  // Duration is always derived from the two timestamps.
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const endBeforeStart = new Date(end).getTime() <= new Date(start).getTime();

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        start_time: fromLocalInput(start),
        end_time: fromLocalInput(end),
        comment: comment.trim() || null,
      };
      if (isEdit) await api.updateSleep(entry.id, payload);
      else await api.createSleep(payload, babyId);
      notify?.(isEdit ? 'Sleep updated' : 'Sleep saved');
      onSaved?.();
    } catch (e) {
      notify?.('Error: ' + e.message);
      setSaving(false);
    }
  };

  const valid = !endBeforeStart;

  const requestClose = useRequestClose();
  // Dirty = changed from how the form opened.
  const sig = [start, end, comment].join('|');
  const initialSig = useRef(sig);
  useDirty(sig !== initialSig.current);

  return (
    <div>
      <div className="field">
        <label>Start time</label>
        <DateTimeField value={start} onChange={setStart} />
      </div>

      <div className="field">
        <label>End time</label>
        <DateTimeField value={end} onChange={setEnd} />
      </div>

      <div className="field">
        <label>
          Duration: {endBeforeStart ? 'End must be after start' : formatDuration(seconds)}
        </label>
      </div>

      <div className="field">
        <label>Comment</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Where, how it went, anything to note?" />
      </div>

      <button className="btn btn-primary" disabled={saving || !valid} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save sleep'}
      </button>
      <button className="btn btn-ghost" onClick={requestClose}>
        Cancel
      </button>
    </div>
  );
}
