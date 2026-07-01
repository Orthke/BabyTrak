import { useState, useRef } from 'react';
import { api } from '../api.js';
import { toLocalInput, fromLocalInput, nowLocalInput, STOOL_AMOUNTS, STOOL_COLORS, STOOL_TEXTURES } from '../utils.js';
import { CONTENT_ICONS, Check } from '../icons.jsx';
import DateTimeField from '../components/DateTimeField.jsx';
import { useDirty, useRequestClose } from '../components/Modal.jsx';

const WetIcon = CONTENT_ICONS.wet;
const DirtyIcon = CONTENT_ICONS.dirty;

export default function DiaperForm({ onSaved, onCancel, notify, babyId, entry }) {
  const isEdit = !!entry;
  const [time, setTime] = useState(entry ? toLocalInput(entry.time) : nowLocalInput());
  const [wet, setWet] = useState(!!entry?.wet);
  const [dirty, setDirty] = useState(!!entry?.dirty);
  const [amount, setAmount] = useState(entry?.stool_amount ?? ''); // stool amount
  const [color, setColor] = useState(entry?.stool_color ?? ''); // stool color
  const [texture, setTexture] = useState(entry?.stool_texture ?? ''); // stool texture
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);

  const requestClose = useRequestClose();
  // Dirty = changed from how the form opened (so editing without changes won't prompt).
  const sig = [time, wet, dirty, amount, color, texture, comment].join('|');
  const initialSig = useRef(sig);
  useDirty(sig !== initialSig.current);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        time: fromLocalInput(time),
        wet,
        dirty,
        stool_amount: dirty ? amount || null : null,
        stool_color: dirty ? color || null : null,
        stool_texture: dirty ? texture || null : null,
        comment: comment.trim() || null,
      };
      if (isEdit) await api.updateDiaper(entry.id, payload);
      else await api.createDiaper(payload, babyId);
      notify?.(isEdit ? 'Diaper updated' : 'Diaper saved');
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
        <label>What's in there?</label>
        <div className="chip-row">
          <button type="button" className={`chip ${wet ? 'active' : ''}`} onClick={() => setWet((v) => !v)}>
            <WetIcon size={22} color="var(--c-wet)" />
            Wet
          </button>
          <button type="button" className={`chip ${dirty ? 'active' : ''}`} onClick={() => setDirty((v) => !v)}>
            <DirtyIcon size={20} color="var(--c-dirty)" />
            Dirty
          </button>
        </div>
      </div>

      {dirty && (
        <>
          <div className="field">
            <label>How much?</label>
            <div className="chip-row wrap">
              {STOOL_AMOUNTS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`chip ${amount === o.value ? 'active' : ''}`}
                  onClick={() => setAmount((v) => (v === o.value ? '' : o.value))}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Color</label>
            <div className="swatch-row">
              {STOOL_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  className={`swatch ${color === c.value ? 'active' : ''}`}
                  style={{ background: c.hex }}
                  onClick={() => setColor((v) => (v === c.value ? '' : c.value))}
                >
                  {color === c.value && <Check size={18} color="#fff" />}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Texture</label>
            <div className="chip-row wrap">
              {STOOL_TEXTURES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`chip ${texture === o.value ? 'active' : ''}`}
                  onClick={() => setTexture((v) => (v === o.value ? '' : o.value))}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="field">
        <label>Comment</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Rash, mood, anything else?" />
      </div>

      <button className="btn btn-primary" disabled={saving || (!wet && !dirty)} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save diaper'}
      </button>
      <button className="btn btn-ghost" onClick={requestClose}>
        Cancel
      </button>
    </div>
  );
}
