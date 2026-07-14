import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { api } from '../api.js';
import {
  formatMinutes,
  formatDate,
  formatWeight,
  formatHeight,
  weightValue,
  heightValue,
  weightUnitLabel,
  weightPctFromBirth,
  todayStr,
  yesterdayStr,
  convertVolume,
  formatVolume,
} from '../utils.js';
import { useToast } from '../components/Toast.jsx';
import { useBaby } from '../context/BabyContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Breast, CupStraw, Droplet, DropletHalf, Diaper, GraphUp, Rulers } from '../icons.jsx';
import CaregiverDashboard from './CaregiverDashboard.jsx';

// CSS-var references (not hardcoded hex) so every chart color follows the
// light/dark theme automatically, same as the rest of the app.
const COLORS = {
  breast: 'var(--c-breast)',
  bottle: 'var(--c-bottle)',
  pump: 'var(--c-pump)',
  diaper: 'var(--c-diaper)',
  wet: 'var(--c-wet)',
  dirty: 'var(--c-dirty)',
  left: 'var(--c-breast)',
  right: 'var(--c-pump)',
  weight: 'var(--c-measure)',
  length: 'var(--c-sleep)',
};

// "Jun 28" — short calendar label for growth-chart x-axis ticks and tooltips.
const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// Custom tooltip for the growth chart: shows the formatted weight with its signed
// % change from birth weight, plus the length, in the baby's display units.
function GrowthTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="growth-tip">
      <div className="growth-tip-date">
        {row.label}
        {row.isBirth ? ' · birth' : ''}
      </div>
      {row.weightText && (
        <div style={{ color: COLORS.weight }}>
          {row.weightText}
          {row.pct != null && (
            <span className="growth-pct">
              {' '}
              ({row.pct >= 0 ? '+' : ''}
              {row.pct}% from birth)
            </span>
          )}
        </div>
      )}
      {row.lengthText && <div style={{ color: COLORS.length }}>{row.lengthText}</div>}
    </div>
  );
}

// Turn the raw measurement list into chronological chart rows. Prepends a birth
// baseline (from the profile birthdate + weight/height) when available so the
// lines start at birth, and computes each weight's % change from birth weight.
// Returns null while measurements are still loading.
function buildGrowth(measurements, baby, wUnit) {
  if (!measurements) return null;
  const hUnit = baby?.height_unit ?? 'in';

  const raw = [];
  if (baby?.birthdate && (baby.weight_grams != null || baby.height_cm != null)) {
    raw.push({ time: `${baby.birthdate}T00:00:00`, weightG: baby.weight_grams ?? null, heightC: baby.height_cm ?? null, isBirth: true });
  }
  for (const m of measurements) {
    raw.push({ time: m.time, weightG: m.weight_grams ?? null, heightC: m.height_cm ?? null, isBirth: false });
  }
  if (raw.length === 0) return [];
  raw.sort((a, b) => (a.time < b.time ? -1 : 1));

  // Baseline for the percentage: the profile (birth) weight if set, else the
  // earliest recorded weight.
  const birthWeightG = baby?.weight_grams ?? raw.find((p) => p.weightG != null)?.weightG ?? null;

  return raw.map((p) => ({
    label: shortDate(p.time),
    isBirth: p.isBirth,
    weight: weightValue(p.weightG, wUnit),
    length: heightValue(p.heightC, hUnit),
    weightText: formatWeight(p.weightG, wUnit),
    lengthText: formatHeight(p.heightC, hUnit),
    pct: weightPctFromBirth(p.weightG, birthWeightG),
  }));
}

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
  // Recharts' default tooltip box is hardcoded white — without these it
  // wouldn't follow dark mode and would show white-on-white.
  backgroundColor: 'var(--c-card)',
  color: 'var(--c-text)',
};

// Recharts renders axis ticks/grid lines with its own defaults (a mid-gray),
// which doesn't track the app theme — pass these explicitly everywhere so
// charts stay legible in dark mode.
const axisTick = { fontSize: 11, fill: 'var(--c-muted)' };
const axisTickBold = { fontSize: 11, fontWeight: 700, fill: 'var(--c-muted)' };
const gridStroke = 'var(--c-border)';

// Caregivers get a medication-only dashboard; babies get the full one. Branching
// at this level (rather than inside one component) keeps hook order stable.
export default function Dashboard() {
  const { subjectType, selectedCaregiver } = useBaby();
  if (subjectType === 'caregiver') {
    return <CaregiverDashboard caregiver={selectedCaregiver} />;
  }
  return <BabyDashboard />;
}

function BabyDashboard() {
  const [days, setDays] = useState(7);
  const [date, setDate] = useState(''); // '' = rolling range; 'YYYY-MM-DD' = single day
  const [data, setData] = useState(null);
  const [measurements, setMeasurements] = useState(null);
  const notify = useToast();
  const { selectedId, selectedBaby } = useBaby();
  const { weightUnit, volumeUnit } = useSettings();

  const isDay = date !== '';
  const today = todayStr();
  const yesterday = yesterdayStr();

  useEffect(() => {
    setData(null);
    api.stats(selectedId, days, date || null).then(setData).catch((e) => notify('Error: ' + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, date, selectedId]);

  // Growth tracks the full history regardless of the range/day filter — weight and
  // length are charted over all time, not bucketed per day.
  useEffect(() => {
    setMeasurements(null);
    api.listMeasurements(selectedId).then(setMeasurements).catch(() => setMeasurements([]));
  }, [selectedId]);

  const growth = buildGrowth(measurements, selectedBaby, weightUnit);

  if (!data) return <p className="empty">Loading…</p>;

  const { daily, totals } = data;

  const hasSideData = totals.leftMinutes + totals.rightMinutes > 0;
  const hasBreastMinutes = totals.breastMinutes > 0;

  const hasData = totals.breastCount + totals.bottleCount + totals.diaperCount + totals.pumpCount > 0;

  const hUnit = selectedBaby?.height_unit ?? 'in';
  const latest = growth && growth.length ? growth[growth.length - 1] : null;
  // Show the chart once at least one measurement is logged; the birth baseline
  // alone (a single point) isn't worth a chart.
  const hasGrowth = !!(measurements && measurements.some((m) => m.weight_grams != null || m.height_cm != null));
  // Daily volume totals come from the server in ml; re-express in the display unit.
  const dailyVolume = daily.map((d) => ({
    ...d,
    bottleMl: convertVolume(d.bottleMl, 'ml', volumeUnit),
    pumpMl: convertVolume(d.pumpMl, 'ml', volumeUnit),
  }));

  return (
    <div>
      <p className="section-title">
        {isDay
          ? `${selectedBaby?.name ?? 'Baby'} on ${formatDate(`${date}T00:00:00`)}`
          : `${selectedBaby?.name ?? 'Baby'}'s last ${days} days`}
      </p>
      <div className="range-tabs">
        <button
          className={isDay && date !== yesterday ? 'active' : ''}
          onClick={() => setDate(today)}
        >
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
      </div>
      {isDay && (
        <div className="day-picker">
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} />
        </div>
      )}

      <div className="stat-grid">
        <StatCard Icon={Breast} color={COLORS.breast} value={totals.breastCount} label="Breast feeds" />
        <StatCard Icon={CupStraw} color={COLORS.bottle} value={totals.bottleCount} label="Bottles" />
        <StatCard Icon={DropletHalf} color={COLORS.pump} value={totals.pumpCount} label="Pump sessions" />
        <StatCard Icon={Droplet} color={COLORS.pump} value={formatVolume(totals.pumpMl, 'ml', volumeUnit)} label="Pumped total" />
        <StatCard Icon={Droplet} color={COLORS.bottle} value={formatVolume(totals.bottleMl, 'ml', volumeUnit)} label="Bottle total" />
        <StatCard Icon={Diaper} color={COLORS.diaper} value={totals.diaperCount} label="Diapers" />
      </div>

      {hasGrowth && (
        <div className="chart-card">
          <p className="chart-title">
            <Rulers size={14} /> Weight &amp; length
            {latest && (
              <span className="chart-sub">
                {' — '}
                {latest.weightText}
                {latest.pct != null && ` (${latest.pct >= 0 ? '+' : ''}${latest.pct}% from birth)`}
                {latest.lengthText ? ` · ${latest.lengthText}` : ''}
              </span>
            )}
          </p>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={growth} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="label" tick={axisTickBold} interval="preserveStartEnd" />
              <YAxis yAxisId="w" tick={axisTick} domain={['auto', 'auto']} />
              <YAxis yAxisId="l" orientation="right" tick={axisTick} domain={['auto', 'auto']} />
              <Tooltip content={<GrowthTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
              <Line
                yAxisId="w"
                type="monotone"
                dataKey="weight"
                name={`Weight (${weightUnitLabel(weightUnit)})`}
                stroke={COLORS.weight}
                strokeWidth={3}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                yAxisId="l"
                type="monotone"
                dataKey="length"
                name={`Length (${hUnit})`}
                stroke={COLORS.length}
                strokeWidth={3}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!hasData ? (
        <div className="empty">
          <GraphUp className="empty-icon" size={44} />
          <p>{isDay ? 'Nothing logged on this day.' : 'No data for this range yet. Add some entries.'}</p>
        </div>
      ) : (
        <>
          <div className="chart-card">
            <p className="chart-title">Feeds per day</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily} margin={{ top: 4, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={axisTickBold} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                <Bar dataKey="breastCount" name="Breast" stackId="f" fill={COLORS.breast} radius={[0, 0, 0, 0]} />
                <Bar dataKey="bottleCount" name="Bottle" stackId="f" fill={COLORS.bottle} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <p className="chart-title">Volume per day ({volumeUnit})</p>
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={dailyVolume} margin={{ top: 4, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={axisTickBold} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                <Line
                  type="monotone"
                  dataKey="bottleMl"
                  name="Bottle fed"
                  stroke={COLORS.bottle}
                  strokeWidth={3}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="pumpMl"
                  name="Pumped"
                  stroke={COLORS.pump}
                  strokeWidth={3}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <p className="chart-title">Diapers per day</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={daily} margin={{ top: 4, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={axisTickBold} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                <Bar dataKey="diaperWet" name="Wet" stackId="d" fill={COLORS.wet} radius={[0, 0, 0, 0]} />
                <Bar dataKey="diaperDirty" name="Dirty" stackId="d" fill={COLORS.dirty} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {hasBreastMinutes && (
            <div className="chart-card">
              <p className="chart-title">
                Breastfeeding per day ({formatMinutes(totals.breastMinutes * 60)} total
                {hasSideData
                  ? ` — L ${formatMinutes(totals.leftMinutes * 60)} / R ${formatMinutes(totals.rightMinutes * 60)}`
                  : ''}
                )
              </p>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={daily} margin={{ top: 4, right: 16, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="label" tick={axisTickBold} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={axisTick} unit="m" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                  {hasSideData ? (
                    <>
                      <Bar dataKey="leftMinutes" name="Left" stackId="b" fill={COLORS.left} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="rightMinutes" name="Right" stackId="b" fill={COLORS.right} radius={[6, 6, 0, 0]} />
                    </>
                  ) : (
                    <Bar dataKey="breastMinutes" name="Minutes" fill={COLORS.breast} radius={[6, 6, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
