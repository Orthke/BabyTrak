import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { CapsulePill, GraphUp } from '../icons.jsx';

const MED_COLOR = 'var(--c-med)';

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
};

export default function CaregiverDashboard({ caregiver }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const notify = useToast();
  const caregiverId = caregiver?.id;

  useEffect(() => {
    setData(null);
    api.caregiverStats(caregiverId, days).then(setData).catch((e) => notify('Error: ' + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, caregiverId]);

  if (!data) return <p className="empty">Loading…</p>;

  const { daily, totals, byMed } = data;
  const hasData = totals.doseCount > 0;

  return (
    <div>
      <p className="section-title">{caregiver?.name ?? 'Caregiver'}'s last {days} days</p>
      <div className="range-tabs">
        {[7, 14, 30].map((d) => (
          <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>
            {d}d
          </button>
        ))}
      </div>

      <div className="stat-grid">
        <StatCard Icon={CapsulePill} color={MED_COLOR} value={totals.doseCount} label="Doses taken" />
        <StatCard Icon={CapsulePill} color={MED_COLOR} value={totals.medCount} label="Medications" />
      </div>

      {!hasData ? (
        <div className="empty">
          <GraphUp className="empty-icon" size={44} />
          <p>No medications logged in this range yet.</p>
        </div>
      ) : (
        <>
          <div className="chart-card">
            <p className="chart-title">Doses per day</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily} margin={{ top: 4, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="doseCount" name="Doses" fill={MED_COLOR} radius={[6, 6, 0, 0]} />
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
