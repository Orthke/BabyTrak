import { useSettings } from '../context/SettingsContext.jsx';
import {
  KIND_META,
  formatBP,
  formatBloodSugar,
  formatTemp,
  halfLabel,
  severityLabel,
  tile,
} from '../utils.js';
import { KIND_ICONS } from '../icons.jsx';
import { describe, whenLabel } from '../entryDisplay.jsx';

// Doses grouped by medication name, in the order they were first taken.
function byMedication(meds) {
  const counts = new Map();
  for (const m of meds) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
  return [...counts];
}

// One line saying what the day did to the cycle: a period started, ended, both,
// or neither (in which case the row is left out).
function periodLine(start, end) {
  if (start && end) return `Started ${halfLabel(start.start_half)} · ended ${halfLabel(end.end_half)}`;
  if (start) return `Started · ${halfLabel(start.start_half)}`;
  if (end) return `Ended · ${halfLabel(end.end_half)}`;
  return null;
}

// What a caregiver logged on one day: doses, readings, and the cycle, then the
// entries themselves (tap one to edit it). The baby version lives in History.
export default function CaregiverDaySummary({ items, onSelectEntry }) {
  const unitPrefs = useSettings();

  if (items.length === 0) return <p className="empty">Nothing logged on this day.</p>;

  const meds = items.filter((i) => i.kind === 'med');
  const temps = items.filter((i) => i.kind === 'temperature');
  const bps = items.filter((i) => i.kind === 'bp');
  const sugars = items.filter((i) => i.kind === 'sugar');
  const symptoms = items.filter((i) => i.kind === 'symptom');
  const period = periodLine(
    items.find((i) => i.kind === 'period'),
    items.find((i) => i.kind === 'period_end')
  );

  const hasReadings = temps.length > 0 || bps.length > 0 || sugars.length > 0;
  const hasCycle = !!period || symptoms.length > 0;
  const join = (list, fmt) => list.map(fmt).filter(Boolean).join(' · ') || '—';

  return (
    <>
      <table className="summary-table">
        <tbody>
          {meds.length > 0 && (
            <>
              <tr className="summary-group">
                <th colSpan={2}>Medication</th>
              </tr>
              <tr>
                <td>Doses</td>
                <td>{meds.length}</td>
              </tr>
              {byMedication(meds).map(([name, count]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>
                    {count} {count === 1 ? 'dose' : 'doses'}
                  </td>
                </tr>
              ))}
            </>
          )}

          {hasReadings && (
            <>
              <tr className="summary-group">
                <th colSpan={2}>Readings</th>
              </tr>
              {temps.length > 0 && (
                <tr>
                  <td>Temperature</td>
                  <td className="summary-values">{join(temps, (t) => formatTemp(t.temp, t.unit))}</td>
                </tr>
              )}
              {bps.length > 0 && (
                <tr>
                  <td>Blood pressure</td>
                  <td className="summary-values">{join(bps, (b) => formatBP(b.systolic, b.diastolic))}</td>
                </tr>
              )}
              {sugars.length > 0 && (
                <tr>
                  <td>Blood sugar</td>
                  <td className="summary-values">{join(sugars, (s) => formatBloodSugar(s.value, s.unit))}</td>
                </tr>
              )}
            </>
          )}

          {hasCycle && (
            <>
              <tr className="summary-group">
                <th colSpan={2}>Cycle</th>
              </tr>
              {period && (
                <tr>
                  <td>Period</td>
                  <td className="summary-values">{period}</td>
                </tr>
              )}
              {symptoms.length > 0 && (
                <>
                  <tr>
                    <td>Symptoms</td>
                    <td>{symptoms.length}</td>
                  </tr>
                  <tr>
                    <td className="summary-list" colSpan={2}>
                      {symptoms
                        .map((s) => {
                          const sev = severityLabel(s.severity);
                          return sev ? `${s.name} (${sev.toLowerCase()})` : s.name;
                        })
                        .join(' · ')}
                    </td>
                  </tr>
                </>
              )}
            </>
          )}
        </tbody>
      </table>

      <p className="section-title">Entries</p>
      {items.map((item) => {
        const meta = KIND_META[item.kind];
        const Icon = KIND_ICONS[item.kind];
        const { title, sub } = describe(item, unitPrefs);
        return (
          <div
            key={`${item.kind}-${item.id}`}
            className="timeline-item tappable"
            role="button"
            tabIndex={0}
            onClick={() => onSelectEntry(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectEntry(item);
              }
            }}
          >
            <span className="icon-tile ti-icon" style={tile(meta.color)}>
              <Icon size={20} />
            </span>
            <div className="ti-body">
              <div className="ti-title">{title}</div>
              <div className="ti-sub">{sub}</div>
              {item.comment && <div className="ti-comment">{item.comment}</div>}
            </div>
            <div className="ti-time">{whenLabel(item)}</div>
          </div>
        );
      })}
    </>
  );
}
