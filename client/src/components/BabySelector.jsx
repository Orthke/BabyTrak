import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import BabyForm from '../forms/BabyForm.jsx';
import CaregiverForm from '../forms/CaregiverForm.jsx';
import { useBaby } from '../context/BabyContext.jsx';
import { useToast } from './Toast.jsx';
import { api } from '../api.js';
import { formatAge, formatWeight, formatHeight, GENDER_META } from '../utils.js';
import { GENDER_ICONS, CAREGIVER_ICON, ChevronDown, Pencil, Trash3, Check, Plus, PersonPlus } from '../icons.jsx';

// Weight/height shown for a baby. Defaults to the profile (birth) values, but
// callers can pass resolved values — e.g. the latest measurement for the
// selected baby — so the pill reflects current weight, not just birth weight.
function babyDetails(
  b,
  weightGrams = b.weight_grams,
  weightUnit = b.weight_unit,
  heightCm = b.height_cm,
  heightUnit = b.height_unit
) {
  const bits = [];
  const age = formatAge(b.birthdate);
  if (age) bits.push(age);
  const w = formatWeight(weightGrams, weightUnit);
  if (w) bits.push(w);
  const h = formatHeight(heightCm, heightUnit);
  if (h) bits.push(h);
  return bits.join(' · ');
}

// Most recent measurement that has a value for `field` ('weight_grams' /
// 'height_cm'). Weight and length are tracked independently, so each picks its
// own latest entry.
function latestWith(measurements, field) {
  if (!measurements) return null;
  let best = null;
  for (const m of measurements) {
    if (m[field] == null) continue;
    if (!best || new Date(m.time) > new Date(best.time)) best = m;
  }
  return best;
}

function tile(color) {
  return { background: `color-mix(in srgb, ${color} 16%, white)`, color };
}

const CAREGIVER_COLOR = 'var(--c-neutral)';

export default function BabySelector() {
  const {
    babies,
    caregivers,
    subjectType,
    selectedBaby,
    selectedCaregiver,
    selectBaby,
    selectCaregiver,
    addBaby,
    updateBaby,
    removeBaby,
    addCaregiver,
    updateCaregiver,
    removeCaregiver,
  } = useBaby();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  // view: 'list' | 'add-baby' | 'add-caregiver' | { type, item }(edit)
  const [view, setView] = useState('list');

  // Latest measurements for the selected baby, so the pill shows current
  // weight/length rather than the birth values stored on the profile.
  const [measurements, setMeasurements] = useState(null);
  const selBabyId = selectedBaby?.id ?? null;
  useEffect(() => {
    if (!selBabyId) {
      setMeasurements(null);
      return;
    }
    let cancelled = false;
    setMeasurements(null);
    api
      .listMeasurements(selBabyId)
      .then((m) => !cancelled && setMeasurements(m))
      .catch(() => !cancelled && setMeasurements([]));
    return () => {
      cancelled = true;
    };
  }, [selBabyId]);

  const close = () => {
    setOpen(false);
    setView('list');
  };

  const isCaregiver = subjectType === 'caregiver';
  const subject = isCaregiver ? selectedCaregiver : selectedBaby;
  const SelIcon = isCaregiver
    ? CAREGIVER_ICON
    : GENDER_ICONS[selectedBaby?.gender] ?? GENDER_ICONS.unspecified;
  // Prefer the latest measured weight/length; fall back to the profile values.
  const latestW = latestWith(measurements, 'weight_grams');
  const latestH = latestWith(measurements, 'height_cm');
  const subjectSub = isCaregiver
    ? 'Caregiver'
    : selectedBaby
    ? babyDetails(
        selectedBaby,
        latestW ? latestW.weight_grams : selectedBaby.weight_grams,
        latestW ? latestW.weight_unit : selectedBaby.weight_unit,
        latestH ? latestH.height_cm : selectedBaby.height_cm,
        latestH ? latestH.height_unit : selectedBaby.height_unit
      )
    : '';

  const editing = typeof view === 'object' ? view : null;

  const onDeleteBaby = async (baby) => {
    if (!confirm(`Delete ${baby.name} and all their entries? This cannot be undone.`)) return;
    try {
      await removeBaby(baby.id);
      notify(`${baby.name} removed`);
      setView('list');
    } catch (e) {
      notify('Error: ' + e.message);
    }
  };

  const onDeleteCaregiver = async (cg) => {
    if (!confirm(`Delete ${cg.name} and all their medication entries? This cannot be undone.`)) return;
    try {
      await removeCaregiver(cg.id);
      notify(`${cg.name} removed`);
      setView('list');
    } catch (e) {
      notify('Error: ' + e.message);
    }
  };

  const modalIcon =
    view === 'list' ? <SelIcon size={20} /> : view === 'add-caregiver' || editing?.type === 'caregiver' ? <CAREGIVER_ICON size={18} /> : <Pencil size={18} />;
  const modalTitle =
    view === 'list'
      ? 'Who are we tracking?'
      : view === 'add-baby'
      ? 'Add baby'
      : view === 'add-caregiver'
      ? 'Add caregiver'
      : `Edit ${editing.item.name}`;

  return (
    <>
      <button className="baby-pill" onClick={() => setOpen(true)}>
        <span className="baby-pill-icon">
          <SelIcon size={18} />
        </span>
        <span className="baby-pill-text">
          <span className="baby-pill-name">{subject ? subject.name : 'Add a baby'}</span>
          {subject && subjectSub && <span className="baby-pill-sub">{subjectSub}</span>}
        </span>
        <span className="baby-pill-caret">
          <ChevronDown size={13} />
        </span>
      </button>

      {open && (
        <Modal title={modalTitle} icon={modalIcon} onClose={close}>
          {view === 'list' && (
            <div>
              {/* Babies */}
              <p className="selector-group-label">Babies</p>
              {babies.length === 0 && (
                <p className="selector-empty">No babies yet — add your little one to get started.</p>
              )}
              {babies.map((b) => {
                const meta = GENDER_META[b.gender] ?? GENDER_META.unspecified;
                const Icon = GENDER_ICONS[b.gender] ?? GENDER_ICONS.unspecified;
                const active = subjectType === 'baby' && selectedBaby?.id === b.id;
                return (
                  <div key={b.id} className={`baby-row ${active ? 'active' : ''}`}>
                    <button
                      className="baby-row-main"
                      onClick={() => {
                        selectBaby(b.id);
                        close();
                      }}
                    >
                      <span className="icon-tile" style={{ width: 42, height: 42, ...tile(meta.color) }}>
                        <Icon size={20} />
                      </span>
                      <span className="baby-row-text">
                        <span className="baby-row-name">
                          {b.name}
                          {active && (
                            <span className="baby-row-check">
                              <Check size={18} />
                            </span>
                          )}
                        </span>
                        <span className="baby-row-sub">{babyDetails(b) || meta.label}</span>
                      </span>
                    </button>
                    <button className="baby-row-edit" onClick={() => setView({ type: 'baby', item: b })} aria-label="Edit">
                      <Pencil size={17} />
                    </button>
                  </div>
                );
              })}
              <button className="btn btn-ghost btn-add-row" onClick={() => setView('add-baby')}>
                <Plus size={18} /> Add baby
              </button>

              {/* Caregivers */}
              <p className="selector-group-label" style={{ marginTop: 18 }}>
                Caregivers
              </p>
              {caregivers.length === 0 && (
                <p className="selector-empty">Track medications for a parent or other caregiver.</p>
              )}
              {caregivers.map((c) => {
                const active = subjectType === 'caregiver' && selectedCaregiver?.id === c.id;
                return (
                  <div key={c.id} className={`baby-row ${active ? 'active' : ''}`}>
                    <button
                      className="baby-row-main"
                      onClick={() => {
                        selectCaregiver(c.id);
                        close();
                      }}
                    >
                      <span className="icon-tile" style={{ width: 42, height: 42, ...tile(CAREGIVER_COLOR) }}>
                        <CAREGIVER_ICON size={20} />
                      </span>
                      <span className="baby-row-text">
                        <span className="baby-row-name">
                          {c.name}
                          {active && (
                            <span className="baby-row-check">
                              <Check size={18} />
                            </span>
                          )}
                        </span>
                        <span className="baby-row-sub">Caregiver</span>
                      </span>
                    </button>
                    <button className="baby-row-edit" onClick={() => setView({ type: 'caregiver', item: c })} aria-label="Edit">
                      <Pencil size={17} />
                    </button>
                  </div>
                );
              })}
              <button className="btn btn-ghost btn-add-row" onClick={() => setView('add-caregiver')}>
                <PersonPlus size={18} /> Add caregiver
              </button>
            </div>
          )}

          {view === 'add-baby' && (
            <BabyForm
              notify={notify}
              onCancel={() => setView('list')}
              onSave={async (data) => {
                await addBaby(data);
                close();
              }}
            />
          )}

          {view === 'add-caregiver' && (
            <CaregiverForm
              notify={notify}
              onCancel={() => setView('list')}
              onSave={async (data) => {
                await addCaregiver(data);
                close();
              }}
            />
          )}

          {editing?.type === 'baby' && (
            <div>
              <BabyForm
                baby={editing.item}
                notify={notify}
                onCancel={() => setView('list')}
                onSave={async (data) => {
                  await updateBaby(editing.item.id, data);
                  setView('list');
                }}
              />
              <button className="btn btn-danger" onClick={() => onDeleteBaby(editing.item)}>
                <Trash3 size={16} /> Delete {editing.item.name}
              </button>
            </div>
          )}

          {editing?.type === 'caregiver' && (
            <div>
              <CaregiverForm
                caregiver={editing.item}
                notify={notify}
                onCancel={() => setView('list')}
                onSave={async (data) => {
                  await updateCaregiver(editing.item.id, data);
                  setView('list');
                }}
              />
              <button className="btn btn-danger" onClick={() => onDeleteCaregiver(editing.item)}>
                <Trash3 size={16} /> Delete {editing.item.name}
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
