import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useToast } from './Toast.jsx';
import { MoonStars, Sun, ClockHistory, Stopwatch, Pencil } from '../icons.jsx';

// Global display-unit preferences: what charts, history, and new-entry forms
// default to. Distinct from a baby's own weight_unit/height_unit (which just
// remembers what that baby's profile was last entered in).
export default function SettingsPanel({ onBack }) {
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [seededPreview, setSeededPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [purging, setPurging] = useState(false);
  const notify = useToast();
  const {
    weightUnit,
    volumeUnit,
    theme,
    autoDarkStart,
    autoDarkEnd,
    isDark,
    timingMode,
    setWeightUnit,
    setVolumeUnit,
    setTheme,
    setAutoDarkStart,
    setAutoDarkEnd,
    setTimingMode,
  } = useSettings();

  useEffect(() => {
    if (!developerOpen) return;
    setLoadingPreview(true);
    api
      .previewSeededValuesPurge()
      .then((preview) => setSeededPreview(preview))
      .catch((e) => notify('Error: ' + e.message))
      .finally(() => setLoadingPreview(false));
  }, [developerOpen, notify]);

  const purgeSeededValues = async () => {
    if (!seededPreview?.total) return;
    if (!confirm('Purge old seeded catalog values that are not referenced by any logged entries?')) return;
    setPurging(true);
    try {
      const result = await api.purgeSeededValues();
      setSeededPreview(result.remaining);
      notify(result.totalDeleted > 0 ? `Purged ${result.totalDeleted} old seeded value${result.totalDeleted === 1 ? '' : 's'}` : 'No purgeable seeded values found');
    } catch (e) {
      notify('Error: ' + e.message);
    } finally {
      setPurging(false);
    }
  };

  if (developerOpen) {
    return (
      <div>
        <div className="field">
          <label>Developer settings</label>
          <p className="selector-empty" style={{ marginTop: 0 }}>
            This only removes known old built-in seeded values that are still legacy rows and are not referenced by any logged medication, milestone, or symptom entry.
          </p>
        </div>

        <div className="field">
          <label>Purge old seeded values</label>
          {loadingPreview ? (
            <p className="selector-empty" style={{ marginTop: 0 }}>Checking for purge candidates…</p>
          ) : seededPreview?.total ? (
            <>
              <p className="selector-empty" style={{ marginTop: 0 }}>
                Found {seededPreview.total} leftover seeded value{seededPreview.total === 1 ? '' : 's'} that can be removed safely.
              </p>
              {seededPreview.medications.length > 0 && (
                <p className="selector-empty" style={{ marginTop: 8, marginBottom: 0 }}>
                  Medications: {seededPreview.medications.map((item) => item.name).join(', ')}
                </p>
              )}
              {seededPreview.milestones.length > 0 && (
                <p className="selector-empty" style={{ marginTop: 8, marginBottom: 0 }}>
                  Milestones: {seededPreview.milestones.map((item) => item.name).join(', ')}
                </p>
              )}
              {seededPreview.symptoms.length > 0 && (
                <p className="selector-empty" style={{ marginTop: 8, marginBottom: 0 }}>
                  Symptoms: {seededPreview.symptoms.map((item) => item.name).join(', ')}
                </p>
              )}
              <button className="btn btn-danger-solid" disabled={purging} onClick={purgeSeededValues}>
                {purging ? 'Purging…' : 'Purge old seeded values'}
              </button>
            </>
          ) : (
            <p className="selector-empty" style={{ marginTop: 0 }}>
              No purgeable seeded values found.
            </p>
          )}
        </div>

        <button className="btn btn-ghost" onClick={() => setDeveloperOpen(false)}>
          Back to settings
        </button>
      </div>
    );
  }

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

      <div className="field">
        <label>Timing for feeds &amp; pumps</label>
        <div className="segmented">
          <button type="button" className={timingMode === 'timer' ? 'active' : ''} onClick={() => setTimingMode('timer')}>
            <Stopwatch size={15} /> Timer
          </button>
          <button
            type="button"
            className={timingMode === 'manual' ? 'active' : ''}
            onClick={() => setTimingMode('manual')}
          >
            <Pencil size={15} /> Manual
          </button>
        </div>
        <p className="selector-empty" style={{ marginTop: 6, marginBottom: 0 }}>
          {timingMode === 'timer'
            ? 'New feeds and pumps open with a running-timer control.'
            : 'New feeds and pumps open with minutes typed in by hand.'}{' '}
          You can switch on any entry.
        </p>
      </div>

      <p className="selector-empty" style={{ marginTop: 4 }}>
        Units apply to charts, history, and dashboards, and are preselected whenever you log a new entry.
      </p>

      <button className="btn btn-ghost" onClick={() => setDeveloperOpen(true)}>
        Developer settings
      </button>

      <button className="btn btn-ghost" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
