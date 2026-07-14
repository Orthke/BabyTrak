import { useState, useRef } from 'react';
import { GENDER_ICONS } from '../icons.jsx';
import { gramsFromLbOz, gramsToLbOz, gramsFromUnit, cmFromUnit, inFromCm } from '../utils.js';
import { useDirty } from '../components/Modal.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

// --- small inline input with a unit suffix ---
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

export default function BabyForm({ baby, onSave, onCancel, notify, hideCancel }) {
  const isEdit = !!baby;
  const { weightUnit: defaultWeightUnit } = useSettings();
  const [name, setName] = useState(baby?.name ?? '');
  const [birthdate, setBirthdate] = useState(baby?.birthdate ?? '');
  const [gender, setGender] = useState(baby?.gender === 'boy' ? 'boy' : baby?.gender === 'girl' ? 'girl' : '');

  // weight
  const [weightUnit, setWeightUnit] = useState(baby?.weight_unit ?? defaultWeightUnit);
  const [weightUnknown, setWeightUnknown] = useState(isEdit ? baby.weight_grams == null : false);
  const initW = weightToInputs(baby?.weight_grams ?? null, baby?.weight_unit ?? 'lb_oz');
  const [wLb, setWLb] = useState(initW.lb);
  const [wOz, setWOz] = useState(initW.oz);
  const [wSingle, setWSingle] = useState(initW.single);

  // height
  const [heightUnit, setHeightUnit] = useState(baby?.height_unit ?? 'in');
  const [heightUnknown, setHeightUnknown] = useState(isEdit ? baby.height_cm == null : false);
  const [hVal, setHVal] = useState(heightToInput(baby?.height_cm ?? null, baby?.height_unit ?? 'in'));

  const [saving, setSaving] = useState(false);

  // Dirty = any field changed from how the form first loaded.
  const sig = [name, birthdate, gender, weightUnknown, weightUnit, wLb, wOz, wSingle, heightUnknown, heightUnit, hVal].join('|');
  const initialSig = useRef(sig);
  useDirty(sig !== initialSig.current);

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

  const save = async () => {
    if (!name.trim() || !gender) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        birthdate: birthdate || null,
        gender,
        weight_grams: weightUnknown ? null : inputsToGrams(weightUnit, wLb, wOz, wSingle),
        weight_unit: weightUnit,
        height_cm: heightUnknown ? null : hVal === '' ? null : cmFromUnit(hVal, heightUnit),
        height_unit: heightUnit,
      });
      notify?.(isEdit ? 'Baby updated' : `Added ${name.trim()}`);
    } catch (e) {
      notify?.('Error: ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="field">
        <label>Name</label>
        <input type="text" value={name} placeholder="Baby's name" onChange={(e) => setName(e.target.value)} autoFocus />
      </div>

      <div className="field">
        <label>Birthdate</label>
        <input type="date" value={birthdate} max="2100-12-31" onChange={(e) => setBirthdate(e.target.value)} />
      </div>

      <div className="field">
        <label>Gender</label>
        <div className="segmented">
          <button type="button" className={gender === 'boy' ? 'active' : ''} onClick={() => setGender('boy')}>
            <GENDER_ICONS.boy size={15} /> Boy
          </button>
          <button type="button" className={gender === 'girl' ? 'active' : ''} onClick={() => setGender('girl')}>
            <GENDER_ICONS.girl size={15} /> Girl
          </button>
        </div>
      </div>

      {/* Weight */}
      <div className="field">
        <div className="label-row">
          <label>Weight</label>
          <button
            type="button"
            className={`mini-toggle ${weightUnknown ? 'active' : ''}`}
            onClick={() => setWeightUnknown((v) => !v)}
          >
            Unknown
          </button>
        </div>
        {!weightUnknown && (
          <>
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
          </>
        )}
      </div>

      {/* Height */}
      <div className="field">
        <div className="label-row">
          <label>Height</label>
          <button
            type="button"
            className={`mini-toggle ${heightUnknown ? 'active' : ''}`}
            onClick={() => setHeightUnknown((v) => !v)}
          >
            Unknown
          </button>
        </div>
        {!heightUnknown && (
          <>
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
          </>
        )}
      </div>

      <button className="btn btn-primary" disabled={saving || !name.trim() || !gender} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add baby'}
      </button>
      {!hideCancel && (
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
