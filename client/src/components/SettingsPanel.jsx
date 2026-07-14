import { useSettings } from '../context/SettingsContext.jsx';
import { MoonStars, Sun, ClockHistory } from '../icons.jsx';

// Global display-unit preferences: what charts, history, and new-entry forms
// default to. Distinct from a baby's own weight_unit/height_unit (which just
// remembers what that baby's profile was last entered in).
export default function SettingsPanel({ onBack }) {
  const {
    weightUnit,
    volumeUnit,
    theme,
    autoDarkStart,
    autoDarkEnd,
    isDark,
    setWeightUnit,
    setVolumeUnit,
    setTheme,
    setAutoDarkStart,
    setAutoDarkEnd,
  } = useSettings();

  return (
    <div>
      <div className="field">
        <label>Theme</label>
        <div className="segmented">
          <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
            <Sun size={15} /> Light
          </button>
          <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
            <MoonStars size={15} /> Dark
          </button>
          <button type="button" className={theme === 'auto' ? 'active' : ''} onClick={() => setTheme('auto')}>
            <ClockHistory size={15} /> Auto
          </button>
        </div>
      </div>

      {theme === 'auto' && (
        <div className="field">
          <div className="label-row">
            <label>Dark hours</label>
            <span className="mini-toggle" style={{ cursor: 'default' }}>
              {isDark ? 'Dark now' : 'Light now'}
            </span>
          </div>
          <div className="row">
            <div className="suffix-input" style={{ flex: 1 }}>
              <input
                type="time"
                value={autoDarkStart}
                onChange={(e) => e.target.value && setAutoDarkStart(e.target.value)}
              />
            </div>
            <div className="suffix-input" style={{ flex: 1 }}>
              <input type="time" value={autoDarkEnd} onChange={(e) => e.target.value && setAutoDarkEnd(e.target.value)} />
            </div>
          </div>
          <p className="selector-empty" style={{ marginTop: 6, marginBottom: 0 }}>
            Dark from {autoDarkStart} to {autoDarkEnd}
            {autoDarkStart > autoDarkEnd ? ', overnight' : ''}. Light the rest of the day.
          </p>
        </div>
      )}

      <div className="field">
        <label>Volume (bottles, pumping)</label>
        <div className="segmented">
          <button type="button" className={volumeUnit === 'ml' ? 'active' : ''} onClick={() => setVolumeUnit('ml')}>
            ml
          </button>
          <button type="button" className={volumeUnit === 'oz' ? 'active' : ''} onClick={() => setVolumeUnit('oz')}>
            oz
          </button>
        </div>
      </div>

      <div className="field">
        <label>Weight</label>
        <div className="segmented">
          <button type="button" className={weightUnit === 'lb_oz' ? 'active' : ''} onClick={() => setWeightUnit('lb_oz')}>
            lb / oz
          </button>
          <button type="button" className={weightUnit === 'kg' ? 'active' : ''} onClick={() => setWeightUnit('kg')}>
            kg
          </button>
          <button type="button" className={weightUnit === 'g' ? 'active' : ''} onClick={() => setWeightUnit('g')}>
            grams
          </button>
        </div>
      </div>

      <p className="selector-empty" style={{ marginTop: 4 }}>
        Units apply to charts, history, and dashboards, and are preselected whenever you log a new entry.
      </p>

      <button className="btn btn-ghost" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
