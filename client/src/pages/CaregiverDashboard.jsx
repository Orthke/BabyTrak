import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { CapsulePill, GraphUp } from '../icons.jsx';
import { todayStr, yesterdayStr, formatDate } from '../utils.js';

const MED_COLOR = 'var(--c-med)';

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

  const { daily = [], totals = { doseCount: 0, medCount: 0 }, byMed = [], medSeries = [] } = data;
  const hasData = totals.doseCount > 0;

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
      </div>

      {!hasData ? (
        <div className="empty">
          <GraphUp className="empty-icon" size={44} />
          <p>
            {isDay
              ? 'Nothing logged on this day.'
              : days === 'all'
                ? 'No medications logged yet.'
                : 'No medications logged in this range yet.'}
          </p>
        </div>
      ) : (
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
      )}
    </div>
  );
}
