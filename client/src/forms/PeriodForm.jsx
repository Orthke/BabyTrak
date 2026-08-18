import { useState, useRef } from 'react';
import { api } from '../api.js';
import {
  todayStr,
  dayFromIso,
  isoFromDayHalf,
  currentHalf,
  PERIOD_HALVES,
  formatDayHalf,
  formatDays,
  daysBetween,
} from '../utils.js';
import { useDirty, useRequestClose } from '../components/Modal.jsx';
import { useFutureEntryConfirm } from '../components/useFutureEntryConfirm.jsx';

// Logs one end of a period: its start, or — days later — its end. Which one is
// decided by `mode` ('start' | 'end') when the form is opened from the Track
// card, and by the event's kind when it's opened to edit one from the history.
//
// Unlike every other entry, a period's ends aren't recorded to the minute: the
// caregiver picks the day and whether it was the morning or the evening, which
// is as much as can honestly be recalled about something noticed in passing.
export default function PeriodForm({ onSaved, onCancel, notify, caregiverId, entry, mode }) {
  const isEnd = mode === 'end' || entry?.kind === 'period_end';
  // In end mode `entry` is always the period being closed, so it's an edit only
  // once an end has already been recorded on it.
  const isEdit = isEnd ? !!entry?.end_time : !!entry;

  const recordedIso = isEnd ? entry?.end_time : entry?.start_time;
  const recordedHalf = isEnd ? entry?.end_half : entry?.start_half;
  const [day, setDay] = useState(recordedIso ? dayFromIso(recordedIso) : todayStr());
  const [half, setHalf] = useState(recordedHalf ?? currentHalf());
  const [comment, setComment] = useState((isEnd ? entry?.end_comment : entry?.start_comment) ?? '');
  const [saving, setSaving] = useState(false);
  const { requestFutureConfirm, futureConfirm } = useFutureEntryConfirm();

  const iso = isoFromDayHalf(day, half);
  // The other end of the same period, which this one can't cross. Both are
  // toISOString() output, so comparing them as strings compares them in time.
  const otherIso = isEnd ? entry?.start_time : entry?.end_time;
  const outOfOrder = !!otherIso && (isEnd ? iso < otherIso : iso > otherIso);
  // Once an end is picked, show what it makes the period's length.
  const lengthDays = isEnd && entry?.start_time && !outOfOrder ? daysBetween(entry.start_time, iso) + 1 : null;

  const requestClose = useRequestClose();
  const sig = [day, half, comment].join('|');
  const initialSig = useRef(sig);
  useDirty(sig !== initialSig.current);

  const valid = !!day && !outOfOrder;

  const save = async () => {
    if (!valid) return;
    if (!(await requestFutureConfirm([iso]))) return;
    setSaving(true);
    try {
      const note = comment.trim() || null;
      if (isEnd) {
        await api.setPeriodEnd(entry.id, { end_time: iso, end_half: half, comment: note });
      } else if (isEdit) {
        await api.updatePeriod(entry.id, { start_time: iso, start_half: half, comment: note });
      } else {
        await api.createPeriod({ start_time: iso, start_half: half, comment: note }, caregiverId);
      }
      notify?.(isEnd ? (isEdit ? 'Period end updated' : 'Period ended') : isEdit ? 'Period updated' : 'Period started');
      onSaved?.();
    } catch (e) {
      notify?.('Error: ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div>
      {isEnd && entry?.start_time && (
        <p className="modal-prompt">Started {formatDayHalf(entry.start_time, entry.start_half)}</p>
      )}

      <div className="field">
        <label>{isEnd ? 'Ended on' : 'Started on'}</label>
        <div className="datetime-field">
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          <div className="segmented">
            {PERIOD_HALVES.map((h) => (
              <button key={h.value} type="button" className={half === h.value ? 'active' : ''} onClick={() => setHalf(h.value)}>
                {h.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(outOfOrder || lengthDays != null) && (
        <div className="field">
          <label>
            {outOfOrder
              ? isEnd
                ? 'The end must be on or after the start'
                : 'The start must be on or before the end'
              : `Length: ${formatDays(lengthDays)}`}
          </label>
        </div>
      )}

      <div className="field">
        <label>Comment</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={isEnd ? 'How it went, anything to note?' : 'Flow, how you feel, anything to note?'}
        />
      </div>

      <button className="btn btn-primary" disabled={saving || !valid} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : isEnd ? 'Log period end' : 'Start period'}
      </button>
      <button className="btn btn-ghost" onClick={requestClose}>
        Cancel
      </button>
      {futureConfirm}
    </div>
  );
}
