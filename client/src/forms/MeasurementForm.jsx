import { useState, useRef } from 'react';
import { api } from '../api.js';
import {
  toLocalInput,
  fromLocalInput,
  nowLocalInput,
  gramsFromLbOz,
  gramsToLbOz,
  gramsFromUnit,
  cmFromUnit,
  inFromCm,
} from '../utils.js';
import DateTimeField from '../components/DateTimeField.jsx';
import { useDirty, useRequestClose } from '../components/Modal.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

// --- small inline input with a unit suffix (mirrors the one in BabyForm) ---
function SuffixInput({ value, onChange, suffix, placeholder, step = '0.1' }) {
  return (
    <div className="suffix-input">
      <input
        type="number"
        min="0"
        step={step}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="suffix">{suffix}</span>
    </div>
  );
}

// grams -> input strings for a given weight unit
function weightToInputs(grams, unit) {
  if (grams == null) return { lb: '', oz: '', single: '' };
  if (unit === 'lb_oz') {
    const { lb, oz } = gramsToLbOz(grams);
    return { lb: String(lb), oz: String(oz), single: '' };
  }
  if (unit === 'kg') return { lb: '', oz: '', single: String(+(grams / 1000).toFixed(2)) };
  return { lb: '', oz: '', single: String(Math.round(grams)) };
}

function inputsToGrams(unit, lb, oz, single) {
  if (unit === 'lb_oz') {
    if (lb === '' && oz === '') return null;
    return gramsFromLbOz(lb, oz);
  }
  if (single === '') return null;
  return gramsFromUnit(single, unit);
}

// cm -> input string for a given height unit
function heightToInput(cm, unit) {
  if (cm == null) return '';
  return unit === 'in' ? String(+inFromCm(cm).toFixed(1)) : String(+cm.toFixed(1));
}

export default function MeasurementForm({ onSaved, onCancel, notify, babyId, entry }) {
  const isEdit = !!entry;
  const { weightUnit: defaultWeightUnit } = useSettings();
  const [time, setTime] = useState(entry ? toLocalInput(entry.time) : nowLocalInput());

  // weight
  const [weightUnit, setWeightUnit] = useState(entry?.weight_unit ?? defaultWeightUnit);
  const initW = weightToInputs(entry?.weight_grams ?? null, entry?.weight_unit ?? 'lb_oz');
  const [wLb, setWLb] = useState(initW.lb);
  const [wOz, setWOz] = useState(initW.oz);
  const [wSingle, setWSingle] = useState(initW.single);

  // height
  const [heightUnit, setHeightUnit] = useState(entry?.height_unit ?? 'in');
  const [hVal, setHVal] = useState(heightToInput(entry?.height_cm ?? null, entry?.height_unit ?? 'in'));

  const [comment, setComment] = useState(entry?.comment ?? '');
  const [saving, setSaving] = useState(false);

  const requestClose = useRequestClose();
  // Dirty = changed from how the form opened (so editing without changes won't prompt).
  const sig = [time, weightUnit, wLb, wOz, wSingle, heightUnit, hVal, comment].join('|');
  const initialSig = useRef(sig);
  useDirty(sig !== initialSig.current);

  // Switching units converts the entered value so it stays the same measurement.
  const changeWeightUnit = (unit) => {
    const grams = inputsToGrams(weightUnit, wLb, wOz, wSingle);
    const next = weightToInputs(grams, unit);
    setWLb(next.lb);
    setWOz(next.oz);
    setWSingle(next.single);
    setWeightUnit(unit);
  };

  const changeHeightUnit = (unit) => {
    const cm = hVal === '' ? null : cmFromUnit(hVal, heightUnit);
    setHVal(heightToInput(cm, unit));
    setHeightUnit(unit);
  };

  const weightGrams = inputsToGrams(weightUnit, wLb, wOz, wSingle);
  const heightCm = hVal === '' ? null : cmFromUnit(hVal, heightUnit);
  // At least one of the two has to be filled in for the entry to mean anything.
  const valid = weightGrams != null || heightCm != null;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const payload = {
        time: fromLocalInput(time),
        weight_grams: weightGrams,
        weight_unit: weightUnit,
        height_cm: heightCm,
        height_unit: heightUnit,
        comment: comment.trim() || null,
      };
      if (isEdit) await api.updateMeasurement(entry.id, payload);
      else await api.createMeasurement(payload, babyId);
      notify?.(isEdit ? 'Measurement updated' : 'Measurement saved');
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

      {/* Weight */}
      <div className="field">
        <label>Weight</label>
        <div className="segmented">
          <button type="button" className={weightUnit === 'lb_oz' ? 'active' : ''} onClick={() => changeWeightUnit('lb_oz')}>
            lb / oz
          </button>
          <button type="button" className={weightUnit === 'kg' ? 'active' : ''} onClick={() => changeWeightUnit('kg')}>
            kg
          </button>
          <button type="button" className={weightUnit === 'g' ? 'active' : ''} onClick={() => changeWeightUnit('g')}>
            grams
          </button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {weightUnit === 'lb_oz' ? (
            <>
              <SuffixInput value={wLb} onChange={setWLb} suffix="lb" placeholder="0" step="1" />
              <SuffixInput value={wOz} onChange={setWOz} suffix="oz" placeholder="0" step="0.5" />
            </>
          ) : (
            <SuffixInput
              value={wSingle}
              onChange={setWSingle}
              suffix={weightUnit}
              placeholder="0"
              step={weightUnit === 'kg' ? '0.01' : '1'}
            />
          )}
        </div>
      </div>

      {/* Length / height */}
      <div className="field">
        <label>Length</label>
        <div className="segmented">
          <button type="button" className={heightUnit === 'in' ? 'active' : ''} onClick={() => changeHeightUnit('in')}>
            inches
          </button>
          <button type="button" className={heightUnit === 'cm' ? 'active' : ''} onClick={() => changeHeightUnit('cm')}>
            cm
          </button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <SuffixInput value={hVal} onChange={setHVal} suffix={heightUnit} placeholder="0" />
        </div>
      </div>

      <div className="field">
        <label>Comment</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Checkup, who measured, anything to note?" />
      </div>

      <button className="btn btn-primary" disabled={saving || !valid} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save measurement'}
      </button>
      <button className="btn btn-ghost" onClick={requestClose}>
        Cancel
      </button>
    </div>
  );
}
