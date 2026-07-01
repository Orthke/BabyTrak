import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const BabyContext = createContext(null);
const SEL_KEY = 'babytrak.selection'; // { type: 'baby' | 'caregiver', id }
const LEGACY_BABY_KEY = 'babytrak.selectedBabyId';

// Restore the saved selection, migrating the older baby-only key if present.
function readStoredSelection() {
  try {
    const raw = localStorage.getItem(SEL_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && (s.type === 'baby' || s.type === 'caregiver') && s.id) return s;
    }
  } catch {
    /* fall through to legacy */
  }
  const legacy = localStorage.getItem(LEGACY_BABY_KEY);
  return legacy ? { type: 'baby', id: Number(legacy) } : null;
}

export function BabyProvider({ children }) {
  const [babies, setBabies] = useState(null); // null = loading
  const [caregivers, setCaregivers] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [selection, setSelection] = useState(readStoredSelection); // { type, id } | null

  const refresh = useCallback(async () => {
    const [b, c] = await Promise.all([api.listBabies(), api.listCaregivers()]);
    setLoadError(false);
    setBabies(b);
    setCaregivers(c);
    return { babies: b, caregivers: c };
  }, []);

  // Load profiles on mount. A failed fetch must NOT be treated as "no babies" —
  // doing so shows the add screen and tempts a duplicate entry. Instead we
  // surface an error state and keep retrying (covers the brief window where the
  // server is restarting and the API is momentarily unreachable).
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer;
    const load = async () => {
      try {
        await refresh();
      } catch {
        if (cancelled) return;
        setLoadError(true);
        attempt += 1;
        const delay = Math.min(1000 * 2 ** (attempt - 1), 8000); // 1s,2s,4s,8s…
        timer = setTimeout(load, delay);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  // Keep the selection valid: fall back to the first baby (then caregiver) if
  // the stored subject is gone.
  useEffect(() => {
    if (babies === null || caregivers === null) return;
    const valid =
      (selection?.type === 'baby' && babies.some((b) => b.id === selection.id)) ||
      (selection?.type === 'caregiver' && caregivers.some((c) => c.id === selection.id));
    if (valid) return;
    if (babies.length) setSelection({ type: 'baby', id: babies[0].id });
    else if (caregivers.length) setSelection({ type: 'caregiver', id: caregivers[0].id });
    else setSelection(null);
  }, [babies, caregivers, selection]);

  useEffect(() => {
    if (selection) localStorage.setItem(SEL_KEY, JSON.stringify(selection));
    else localStorage.removeItem(SEL_KEY);
  }, [selection]);

  const selectBaby = useCallback((id) => setSelection({ type: 'baby', id }), []);
  const selectCaregiver = useCallback((id) => setSelection({ type: 'caregiver', id }), []);

  const addBaby = useCallback(
    async (data) => {
      const baby = await api.createBaby(data);
      await refresh();
      setSelection({ type: 'baby', id: baby.id });
      return baby;
    },
    [refresh]
  );

  const updateBaby = useCallback(
    async (id, data) => {
      const baby = await api.updateBaby(id, data);
      await refresh();
      return baby;
    },
    [refresh]
  );

  const removeBaby = useCallback(
    async (id) => {
      await api.deleteBaby(id);
      await refresh();
    },
    [refresh]
  );

  const addCaregiver = useCallback(
    async (data) => {
      const cg = await api.createCaregiver(data);
      await refresh();
      setSelection({ type: 'caregiver', id: cg.id });
      return cg;
    },
    [refresh]
  );

  const updateCaregiver = useCallback(
    async (id, data) => {
      const cg = await api.updateCaregiver(id, data);
      await refresh();
      return cg;
    },
    [refresh]
  );

  const removeCaregiver = useCallback(
    async (id) => {
      await api.deleteCaregiver(id);
      await refresh();
    },
    [refresh]
  );

  const subjectType = selection?.type ?? 'baby';
  const selectedBaby =
    subjectType === 'baby' ? babies?.find((b) => b.id === selection?.id) ?? null : null;
  const selectedCaregiver =
    subjectType === 'caregiver' ? caregivers?.find((c) => c.id === selection?.id) ?? null : null;

  return (
    <BabyContext.Provider
      value={{
        babies: babies ?? [],
        caregivers: caregivers ?? [],
        loading: babies === null && !loadError,
        loadError: babies === null && loadError,
        retry: refresh,
        // Selection
        subjectType,
        selectedBaby,
        selectedCaregiver,
        selectedId: selectedBaby?.id ?? null, // baby id (legacy callers)
        selectBaby,
        selectCaregiver,
        // Mutations
        addBaby,
        updateBaby,
        removeBaby,
        addCaregiver,
        updateCaregiver,
        removeCaregiver,
        refresh,
      }}
    >
      {children}
    </BabyContext.Provider>
  );
}

export function useBaby() {
  const ctx = useContext(BabyContext);
  if (!ctx) throw new Error('useBaby must be used within BabyProvider');
  return ctx;
}
