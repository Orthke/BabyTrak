import { useEffect, useRef, useState } from 'react';
import { KIND_META, tile } from '../utils.js';
import { KIND_ICONS, Check, Funnel, FunnelFill } from '../icons.jsx';

// Kinds a caregiver logs — the filter only offers these in the caregiver view.
const CAREGIVER_KINDS = ['med', 'temperature', 'bp', 'sugar'];
// Kinds tracked only for caregivers, never babies (excluded from the baby filter).
const CAREGIVER_ONLY_KINDS = ['bp'];

// The Track page's out-of-the-box card order (sleep leads, then the OPTIONS
// order) and the localStorage keys it persists a user's custom order and hidden
// cards under. We mirror all three so the filter lists kinds in the same order
// the user sees on Track and omits the ones they've hidden.
const TRACK_DEFAULT_ORDER = ['sleep', 'feed', 'pump', 'diaper', 'med', 'milestone', 'measurement', 'temperature', 'bp', 'sugar'];
const TRACK_ORDER_KEY = 'babytrak.trackOrder';
const TRACK_HIDDEN_KEY = 'babytrak.hiddenKinds';

// The kinds the user hid on the Track page, for one scope ('baby' | 'caregiver').
// Hidden state is a { baby, caregiver } map so the two views hide independently;
// a legacy flat array is treated as the baby scope. Hidden cards drop out of the
// filter list entirely (and so their entries stop showing in the timeline).
function hiddenKinds(scope) {
  try {
    const saved = JSON.parse(localStorage.getItem(TRACK_HIDDEN_KEY) || 'null');
    const arr = Array.isArray(saved) ? (scope === 'baby' ? saved : []) : saved?.[scope];
    if (Array.isArray(arr) && arr.every((k) => typeof k === 'string')) return new Set(arr);
  } catch {
    /* ignore malformed storage */
  }
  return new Set();
}

// Kinds in Track-page order: the user's saved order if any, with any known kinds
// it's missing appended (and unknown entries dropped) so the list stays complete.
// Hidden kinds (for this scope) are removed so the filter never offers a card the
// user turned off.
function trackOrderKinds(scope) {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(TRACK_ORDER_KEY) || 'null');
  } catch {
    /* ignore malformed storage */
  }
  const base = Array.isArray(saved) && saved.every((k) => typeof k === 'string') ? saved : TRACK_DEFAULT_ORDER;
  const hidden = hiddenKinds(scope);
  return [
    ...base.filter((k) => TRACK_DEFAULT_ORDER.includes(k)),
    ...TRACK_DEFAULT_ORDER.filter((k) => !base.includes(k)),
  ].filter((k) => !hidden.has(k));
}

// Top-right dropdown that toggles which kinds show in a timeline. The filter is
// temporary (kept in component state, never persisted) so it resets on reload.
export function FilterMenu({ kinds, shown, allSelected, active, onToggle, onToggleAll }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const FunnelIcon = active ? FunnelFill : Funnel;
  return (
    <div className="filter-menu" ref={ref}>
      <button
        type="button"
        className={`filter-btn ${active ? 'active' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <FunnelIcon size={12} /> Filter
      </button>
      <div className={`filter-pop ${open ? 'open' : ''}`} role="menu" aria-hidden={!open}>
        <button type="button" className="filter-all" onClick={onToggleAll}>
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
        <div className="filter-list">
          {kinds.map((k) => {
            const Icon = KIND_ICONS[k];
            const on = shown.has(k);
            return (
              <button
                key={k}
                type="button"
                className={`filter-row ${on ? 'on' : ''}`}
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => onToggle(k)}
              >
                <span className="icon-tile filter-ico" style={tile(KIND_META[k].color)}>
                  <Icon size={15} />
                </span>
                <span className="filter-label">{KIND_META[k].label}</span>
                <span className="filter-check">{on && <Check size={16} />}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Encapsulates the kind-filter state and its dropdown. Returns the set of kinds
// currently shown, a ready-to-render <FilterMenu>, and a `reset()` to clear the
// filter back to "all shown" (call it when the subject changes). Both the
// History and Timeline pages drive their views off this so they filter alike.
export function useKindFilter(isCaregiver) {
  const [enabledKinds, setEnabledKinds] = useState(null); // Set of kinds shown; null = all shown

  // Kinds offered in the filter, in Track-page order, minus the cards hidden for
  // this scope. Caregivers only log a subset; babies see everything except the
  // caregiver-only kinds (blood pressure).
  const filterKinds = trackOrderKinds(isCaregiver ? 'caregiver' : 'baby').filter((k) =>
    isCaregiver ? CAREGIVER_KINDS.includes(k) : !CAREGIVER_ONLY_KINDS.includes(k)
  );
  // null = everything shown; otherwise the explicit set of enabled kinds.
  const shownKinds = enabledKinds ?? new Set(filterKinds);
  const allSelected = filterKinds.every((k) => shownKinds.has(k));
  const filterActive = !allSelected;

  const toggleKind = (kind) =>
    setEnabledKinds((prev) => {
      const next = new Set(prev ?? filterKinds);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const toggleAll = () => setEnabledKinds(allSelected ? new Set() : new Set(filterKinds));
  const reset = () => setEnabledKinds(null);

  const filterMenu = (
    <FilterMenu
      kinds={filterKinds}
      shown={shownKinds}
      allSelected={allSelected}
      active={filterActive}
      onToggle={toggleKind}
      onToggleAll={toggleAll}
    />
  );

  return { shownKinds, filterMenu, reset };
}
