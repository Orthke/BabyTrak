import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';

const SettingsContext = createContext(null);
const KEY = 'babytrak.settings';
// { weightUnit: 'lb_oz'|'kg'|'g', volumeUnit: 'ml'|'oz',
//   theme: 'light'|'dark'|'auto', autoDarkStart: 'HH:MM', autoDarkEnd: 'HH:MM',
//   timingMode: 'timer'|'manual' }

const DEFAULTS = {
  weightUnit: 'lb_oz',
  volumeUnit: 'ml',
  theme: 'light',
  autoDarkStart: '20:00',
  autoDarkEnd: '07:00',
  timingMode: 'timer',
};
const WEIGHT_UNITS = ['lb_oz', 'kg', 'g'];
const VOLUME_UNITS = ['ml', 'oz'];
const THEMES = ['light', 'dark', 'auto'];
const TIMING_MODES = ['timer', 'manual'];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isValidTime = (v) => typeof v === 'string' && TIME_RE.test(v);

function readStored() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return {
      weightUnit: WEIGHT_UNITS.includes(saved?.weightUnit) ? saved.weightUnit : DEFAULTS.weightUnit,
      volumeUnit: VOLUME_UNITS.includes(saved?.volumeUnit) ? saved.volumeUnit : DEFAULTS.volumeUnit,
      theme: THEMES.includes(saved?.theme) ? saved.theme : DEFAULTS.theme,
      autoDarkStart: isValidTime(saved?.autoDarkStart) ? saved.autoDarkStart : DEFAULTS.autoDarkStart,
      autoDarkEnd: isValidTime(saved?.autoDarkEnd) ? saved.autoDarkEnd : DEFAULTS.autoDarkEnd,
      timingMode: TIMING_MODES.includes(saved?.timingMode) ? saved.timingMode : DEFAULTS.timingMode,
    };
  } catch {
    return DEFAULTS;
  }
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Whether "now" (minutes since midnight) falls in a [start, end) window that may
// wrap past midnight (e.g. 20:00 -> 07:00 spans two calendar days).
function withinWindow(nowMin, startMin, endMin) {
  if (startMin === endMin) return false; // zero-width window never applies
  return startMin < endMin ? nowMin >= startMin && nowMin < endMin : nowMin >= startMin || nowMin < endMin;
}

// Dark mode is active if the theme is 'dark' outright, or 'auto' and the current
// local time falls within the configured window.
export function resolveIsDark(theme, autoDarkStart, autoDarkEnd, now = new Date()) {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return withinWindow(nowMin, toMinutes(autoDarkStart), toMinutes(autoDarkEnd));
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(readStored);
  const { theme, autoDarkStart, autoDarkEnd } = settings;

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore unavailable storage */
      }
      return next;
    });
  }, []);

  const setWeightUnit = useCallback((weightUnit) => update({ weightUnit }), [update]);
  const setVolumeUnit = useCallback((volumeUnit) => update({ volumeUnit }), [update]);
  const setTheme = useCallback((theme) => update({ theme }), [update]);
  const setAutoDarkStart = useCallback((autoDarkStart) => update({ autoDarkStart }), [update]);
  const setAutoDarkEnd = useCallback((autoDarkEnd) => update({ autoDarkEnd }), [update]);
  const setTimingMode = useCallback((timingMode) => update({ timingMode }), [update]);

  // 'auto' needs to flip live as the clock crosses the window edge while the app
  // is sitting open, so tick a re-render every minute — but only then, since
  // 'light'/'dark' are static and don't need polling.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (theme !== 'auto') return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [theme]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const isDark = useMemo(() => resolveIsDark(theme, autoDarkStart, autoDarkEnd), [theme, autoDarkStart, autoDarkEnd, tick]);

  useEffect(() => {
    document.documentElement.dataset.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        isDark,
        setWeightUnit,
        setVolumeUnit,
        setTheme,
        setAutoDarkStart,
        setAutoDarkEnd,
        setTimingMode,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
