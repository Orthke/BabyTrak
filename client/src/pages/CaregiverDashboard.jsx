import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { CapsulePill, GraphUp, KIND_ICONS } from '../icons.jsx';
import { todayStr, yesterdayStr, formatDate, formatDayHalf, formatDays } from '../utils.js';

const MED_COLOR = 'var(--c-med)';
const PERIOD_COLOR = 'var(--c-period)';
const SYMPTOM_COLOR = 'var(--c-symptom)';
const PeriodIcon = KIND_ICONS.period;
const SymptomIcon = KIND_ICONS.symptom;

// Fixed categorical order (never re-cycled per filter) for the per-medication
// stack. CSS-var references (with dark-mode-brightened overrides in
// index.css) rather than hardcoded hex, so the stack follows the theme.
const MED_SERIES_COLORS = [
  'var(--c-med-series-1)',
  'var(--c-med-series-2)',
  'var(--c-med-series-3)',
  'var(--c-med-series-4)',
  'var(--c-med-series-5)',
  'var(--c-med-series-6)',
  'var(--c-med-series-7)',
  'var(--c-med-series-8)',
];
const OTHER_COLOR = 'var(--c-med-other)';
const medSeriesColor = (name, index) => (name === 'Other' ? OTHER_COLOR : MED_SERIES_COLORS[index % MED_SERIES_COLORS.length]);

function StatCard({ Icon, color, value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ color }}>
        <Icon size={20} />
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// One line at the top of the cycle card answering "where am I right now?" — the
// running period's day, or how long it's been since the last one ended.
function cycleStatus(period) {
  if (period.current) {
    return `Period under way · day ${period.current.day}, started ${formatDayHalf(
      period.current.start_time,
      period.current.start_half
    )}`;
  }
  if (period.last) {
    const { daysAgo } = period.last;
    const when = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
    return `No period under way · last one ended ${when}`;
  }
  return 'No period under way';
}

// A cell per day in the shown range, filled on the days a period covered. Read
// left to right it's the cycle at a glance — where the bleeding days clustered
// and how much of the window they took up.
function CycleStrip({ daily }) {
  return (
    <div className="cycle-strip" aria-hidden="true">
      {daily.map((d) => (
        <span key={d.date} className={`cycle-day ${d.bleeding ? 'on' : ''}`} title={`${d.label}${d.bleeding ? ' · period' : ''}`} />
      ))}
    </div>
  );
}

// Short date for the averages' basis line — the year only when it isn't this one.
function shortDate(iso) {
  const d = new Date(iso);
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

// The averages deliberately ignore the range tabs — a 7-day view rarely holds
// enough periods to average — so each one says what it was actually figured
// over: how many periods (or cycles), across which stretch of history.
function basisNote(basis, { one, many, none }) {
  if (!basis?.count) return `All time · ${none}`;
  const span = basis.from && basis.to ? ` · ${shortDate(basis.from)} – ${shortDate(basis.to)}` : '';
  return `All time · ${basis.count} ${basis.count === 1 ? one : many}${span}`;
}

// Everything period-related: where the cycle stands now, the averages, the
// periods that touched the shown range, and what was felt during them.
function CycleCards({ period, daily }) {
  const { recent = [], bySymptom = [] } = period;
  return (
    <>
      <div className="chart-card">
        <p className="chart-title">Cycle</p>
        <p className="cycle-status">{cycleStatus(period)}</p>
        <CycleStrip daily={daily} />
        <table className="summary-table">
          <tbody>
            <tr>
              <td>
                Average period length
                <span className="summary-note">
                  {basisNote(period.avgLength, { one: 'period', many: 'periods', none: 'no completed period yet' })}
                </span>
              </td>
              <td>{formatDays(period.avgLength?.days) ?? '—'}</td>
            </tr>
            <tr>
              <td>
                Average cycle length
                <span className="summary-note">
                  {basisNote(period.avgCycle, { one: 'cycle', many: 'cycles', none: 'needs a second period' })}
                </span>
              </td>
              <td>{formatDays(period.avgCycle?.days) ?? '—'}</td>
            </tr>
          </tbody>
        </table>
        {recent.length > 0 && (
          <div className="med-breakdown">
            {recent.map((p) => (
              <div key={p.id} className="med-breakdown-row">
                <span className="med-breakdown-name">
                  {formatDayHalf(p.start_time, p.start_half)}
                  {p.end_time ? ` – ${formatDayHalf(p.end_time, p.end_half)}` : ' – ongoing'}
                </span>
                <span className="med-breakdown-count">
                  {formatDays(p.lengthDays) ?? 'ongoing'}
                  {p.symptomCount > 0 && ` · ${p.symptomCount} sympt.`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {bySymptom.length > 0 && (
        <div className="chart-card">
          <p className="chart-title">By symptom</p>
          <div className="med-breakdown">
            {bySymptom.map((s) => (
              <div key={s.name} className="med-breakdown-row">
                <span className="med-breakdown-name">{s.name}</span>
                <span className="med-breakdown-count">
                  {s.count} {s.count === 1 ? 'time' : 'times'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: 'none',
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  fontWeight: 700,
  fontSize: 13,
  backgroundColor: 'var(--c-card)',
  color: 'var(--c-text)',
};
const axisTick = { fontSize: 11, fill: 'var(--c-muted)' };
const axisTickBold = { fontSize: 11, fontWeight: 700, fill: 'var(--c-muted)' };
const gridStroke = 'var(--c-border)';

// Doses per day, stacked by medication, and the per-medication totals under it.
function MedCards({ daily, byMed, medSeries }) {
  return (
    <>
      <div className="chart-card">
        <p className="chart-title">Doses per day</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={daily} margin={{ top: 4, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={axisTickBold} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={axisTick} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
            {medSeries.map((name, i) => (
              <Bar
                key={name}
                dataKey={name}
                name={name}
                stackId="meds"
                fill={medSeriesColor(name, i)}
                radius={i === medSeries.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <p className="chart-title">By medication</p>
        <div className="med-breakdown">
          {byMed.map((m) => (
            <div key={m.name} className="med-breakdown-row">
              <span className="med-breakdown-name">{m.name}</span>
              <span className="med-breakdown-count">
                {m.count} {m.count === 1 ? 'dose' : 'doses'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function CaregiverDashboard({ caregiver }) {
  const [days, setDays] = useState(7); // 7 | 14 | 30 | 'all' (every logged day, no cutoff)
  const [date, setDate] = useState(''); // '' = rolling range; 'YYYY-MM-DD' = single day
  const [data, setData] = useState(null);
  const notify = useToast();
  const caregiverId = caregiver?.id;

  const isDay = date !== '';
  const today = todayStr();
  const yesterday = yesterdayStr();

  useEffect(() => {
    setData(null);
    api.caregiverStats(caregiverId, days, date || null).then(setData).catch((e) => notify('Error: ' + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, date, caregiverId]);

  if (!data) return <p className="empty">Loading…</p>;

  const {
    daily = [],
    totals = { doseCount: 0, medCount: 0, symptomCount: 0, bleedingDays: 0 },
    byMed = [],
    medSeries = [],
    period = {},
  } = data;
  const hasMeds = totals.doseCount > 0;
  // The cycle section earns its place as soon as anything period-shaped exists —
  // including a period that's running but has nothing logged against it yet.
  const hasCycle = period.count > 0 || period.symptomCount > 0 || !!period.current;
  const hasData = hasMeds || hasCycle;

  return (
    <div>
      <p className="section-title">
        {isDay
          ? `${caregiver?.name ?? 'Caregiver'} on ${formatDate(`${date}T00:00:00`)}`
          : days === 'all'
            ? `${caregiver?.name ?? 'Caregiver'}'s full history`
            : `${caregiver?.name ?? 'Caregiver'}'s last ${days} days`}
      </p>
      <div className="range-tabs">
        <button className={isDay && date !== yesterday ? 'active' : ''} onClick={() => setDate(today)}>
          {isDay && date !== today && date !== yesterday ? 'Custom' : 'Today'}
        </button>
        <button className={date === yesterday ? 'active' : ''} onClick={() => setDate(yesterday)}>
          Yesterday
        </button>
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            className={!isDay && days === d ? 'active' : ''}
            onClick={() => {
              setDate('');
              setDays(d);
            }}
          >
            {d}d
          </button>
        ))}
        <button
          className={!isDay && days === 'all' ? 'active' : ''}
          onClick={() => {
            setDate('');
            setDays('all');
          }}
        >
          All
        </button>
      </div>
      {isDay && (
        <div className="day-picker">
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} />
        </div>
      )}

      <div className="stat-grid">
        <StatCard Icon={CapsulePill} color={MED_COLOR} value={totals.doseCount} label="Doses taken" />
        <StatCard Icon={CapsulePill} color={MED_COLOR} value={totals.medCount} label="Medications" />
        {hasCycle && (
          <>
            <StatCard Icon={PeriodIcon} color={PERIOD_COLOR} value={totals.bleedingDays} label="Period days" />
            <StatCard Icon={SymptomIcon} color={SYMPTOM_COLOR} value={totals.symptomCount} label="Symptoms" />
          </>
        )}
      </div>

      {!hasData ? (
        <div className="empty">
          <GraphUp className="empty-icon" size={44} />
          <p>
            {isDay
              ? 'Nothing logged on this day.'
              : days === 'all'
                ? 'Nothing logged yet.'
                : 'Nothing logged in this range yet.'}
          </p>
        </div>
      ) : (
        <>
          {hasCycle && <CycleCards period={period} daily={daily} />}
          {hasMeds && <MedCards daily={daily} byMed={byMed} medSeries={medSeries} />}
        </>
      )}
    </div>
  );
}
