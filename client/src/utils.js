// Formatting + time helpers shared across the UI.

export function pad(n) {
  return String(n).padStart(2, '0');
}

export const ML_PER_OZ = 29.5735;

// Re-express a volume in the other unit (rounded to 1 decimal), e.g.
// convertVolume(60, 'ml', 'oz') -> 2. Same-unit calls are a no-op.
export function convertVolume(amount, fromUnit, toUnit) {
  if (fromUnit === toUnit) return amount;
  const ml = fromUnit === 'oz' ? amount * ML_PER_OZ : amount;
  const converted = toUnit === 'oz' ? ml / ML_PER_OZ : ml;
  return Math.round(converted * 10) / 10;
}

// seconds -> "mm:ss" or "h:mm:ss"
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

// seconds -> "Xm" / "Xh Ym" for compact summaries
export function formatMinutes(totalSeconds) {
  const m = Math.round(totalSeconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ISO -> "3:45 PM"
export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Today as a local 'YYYY-MM-DD' string (en-CA renders ISO order in local time).
export const todayStr = () => new Date().toLocaleDateString('en-CA');
// Yesterday in the same local 'YYYY-MM-DD' form.
export const yesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA');
};

// ISO -> "Mon, Jun 28"
export function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// Relative-ish "2h ago", "just now"
export function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return m ? `${h}h ${m}m ago` : `${h}h ago`;
  }
  return `${Math.floor(diff / 86400)}d ago`;
}

// For datetime-local inputs: ISO -> "YYYY-MM-DDTHH:mm" in local time
export function toLocalInput(date = new Date()) {
  const d = new Date(date);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// datetime-local string -> ISO string
export function fromLocalInput(value) {
  return new Date(value).toISOString();
}

// datetime-local string for "now", rounded to the nearest `stepMin` minutes.
// Used as the default for new entries so it lines up with the 5-min picker step.
export function nowLocalInput(stepMin = 5) {
  const ms = stepMin * 60000;
  return toLocalInput(new Date(Math.round(Date.now() / ms) * ms));
}

// Duration of a sleep/nap in seconds. For an in-progress nap (no end_time) it's
// measured up to `nowMs` (default: now) so a live timer can tick toward stop.
export function sleepSeconds(sleep, nowMs = Date.now()) {
  const start = new Date(sleep.start_time).getTime();
  const end = sleep.end_time ? new Date(sleep.end_time).getTime() : nowMs;
  return Math.max(0, Math.round((end - start) / 1000));
}

// birthdate 'YYYY-MM-DD' -> "3 weeks old", "5 days old", "1 yr 2 mo"
export function formatAge(birthdate) {
  if (!birthdate) return null;
  const birth = new Date(birthdate + 'T00:00:00');
  const now = new Date();
  const dayMs = 86400000;
  const totalDays = Math.floor((now - birth) / dayMs);
  if (totalDays < 0) return 'not born yet';
  if (totalDays === 0) return 'born today';
  if (totalDays < 14) return `${totalDays} day${totalDays === 1 ? '' : 's'} old`;
  if (totalDays < 70) {
    const w = Math.floor(totalDays / 7);
    return `${w} week${w === 1 ? '' : 's'} old`;
  }
  // months / years
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 24) return `${months} month${months === 1 ? '' : 's'} old`;
  const yrs = Math.floor(months / 12);
  const mo = months % 12;
  return mo ? `${yrs} yr ${mo} mo` : `${yrs} years old`;
}

/* ----------------------- weight & height ----------------------- */

const G_PER_LB = 453.59237;
const G_PER_OZ = 28.349523125;
const CM_PER_IN = 2.54;

export function gramsFromLbOz(lb, oz) {
  return (Number(lb) || 0) * G_PER_LB + (Number(oz) || 0) * G_PER_OZ;
}

// grams -> { lb, oz } with oz rounded to a whole number (handles 16oz rollover)
export function gramsToLbOz(grams) {
  let totalOz = Math.round(grams / G_PER_OZ);
  const lb = Math.floor(totalOz / 16);
  const oz = totalOz - lb * 16;
  return { lb, oz };
}

export function gramsFromUnit(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (unit === 'kg') return n * 1000;
  return n; // grams
}

export function formatWeight(grams, unit) {
  if (grams == null) return null;
  if (unit === 'lb_oz') {
    const { lb, oz } = gramsToLbOz(grams);
    return `${lb} lb ${oz} oz`;
  }
  if (unit === 'kg') return `${(grams / 1000).toFixed(2)} kg`;
  return `${Math.round(grams)} g`;
}

export const cmFromIn = (inch) => (Number(inch) || 0) * CM_PER_IN;
export const inFromCm = (cm) => cm / CM_PER_IN;

export function cmFromUnit(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return unit === 'in' ? n * CM_PER_IN : n;
}

export function formatHeight(cm, unit) {
  if (cm == null) return null;
  if (unit === 'in') return `${(cm / CM_PER_IN).toFixed(1)} in`;
  return `${cm.toFixed(1)} cm`;
}

// Numeric weight in the display unit, for charting. lb_oz plots as decimal pounds
// (a continuous axis can't use lb+oz), kg/g as themselves.
export function weightValue(grams, unit) {
  if (grams == null) return null;
  if (unit === 'kg') return +(grams / 1000).toFixed(2);
  if (unit === 'g') return Math.round(grams);
  return +(grams / G_PER_LB).toFixed(2); // lb_oz
}

// Numeric height in the display unit, for charting.
export function heightValue(cm, unit) {
  if (cm == null) return null;
  return unit === 'in' ? +(cm / CM_PER_IN).toFixed(1) : +cm.toFixed(1);
}

// Short axis label for a weight unit ('lb_oz' charts as decimal pounds).
export const weightUnitLabel = (unit) => (unit === 'lb_oz' ? 'lb' : unit);

// Signed % change of a weight vs. the birth-weight baseline, rounded. null when
// the baseline is missing/zero or the weight is absent.
export function weightPctFromBirth(grams, birthGrams) {
  if (grams == null || !birthGrams) return null;
  return Math.round(((grams - birthGrams) / birthGrams) * 100);
}

export const GENDER_META = {
  boy: { label: 'Boy', color: 'var(--c-boy)' },
  girl: { label: 'Girl', color: 'var(--c-girl)' },
  unspecified: { label: 'Baby', color: 'var(--c-neutral)' },
};

export const KIND_META = {
  feed: { label: 'Feed', color: 'var(--c-breast)' },
  pump: { label: 'Pump', color: 'var(--c-pump)' },
  diaper: { label: 'Diaper', color: 'var(--c-diaper)' },
  med: { label: 'Medication', color: 'var(--c-med)' },
  milestone: { label: 'Milestone', color: 'var(--c-milestone)' },
  sleep: { label: 'Sleep', color: 'var(--c-sleep)' },
  measurement: { label: 'Measurement', color: 'var(--c-measure)' },
  temperature: { label: 'Temperature', color: 'var(--c-temp)' },
  bp: { label: 'Blood pressure', color: 'var(--c-bp)' },
  sugar: { label: 'Blood sugar', color: 'var(--c-sugar)' },
};

// Inline style for a colored "icon tile": a faint tint of the kind color as the
// background with the full color as the foreground. Shared by the timeline,
// history, and filter UIs so every icon chip reads the same.
export function tile(color) {
  return { background: `color-mix(in srgb, ${color} 14%, white)`, color };
}

// Temperature reading -> "98.6°F". Trims a trailing ".0" so whole numbers read
// cleanly.
export function formatTemp(temp, unit) {
  if (temp == null) return null;
  const n = +Number(temp).toFixed(1);
  return `${n}°${unit === 'C' ? 'C' : 'F'}`;
}

// How the temperature was taken.
export const TEMP_METHODS = [
  { value: 'oral', label: 'Oral' },
  { value: 'forehead', label: 'Forehead' },
  { value: 'axillary', label: 'Axillary' }, // under the armpit
];

export const tempMethodLabel = (v) => TEMP_METHODS.find((m) => m.value === v)?.label ?? null;

// Blood pressure -> "120/80". Returns null if either number is missing.
export function formatBP(systolic, diastolic) {
  if (systolic == null || diastolic == null) return null;
  return `${systolic}/${diastolic}`;
}

// mg/dL ⇄ mmol/L for blood glucose. 1 mmol/L = 18.0182 mg/dL.
export const MGDL_PER_MMOL = 18.0182;

// Blood sugar -> "95 mg/dL" / "5.3 mmol/L". mg/dL reads as a whole number,
// mmol/L to one decimal. Returns null if the value is missing.
export function formatBloodSugar(value, unit) {
  if (value == null) return null;
  if (unit === 'mmol/L') return `${+Number(value).toFixed(1)} mmol/L`;
  return `${Math.round(Number(value))} mg/dL`;
}

// When a glucose reading was taken — the context that makes the number readable.
export const GLUCOSE_CONTEXTS = [
  { value: 'fasting', label: 'Fasting' },
  { value: 'before_meal', label: 'Before meal' },
  { value: 'after_meal', label: 'After meal' },
  { value: 'bedtime', label: 'Bedtime' },
  { value: 'random', label: 'Random' },
];

export const glucoseContextLabel = (v) => GLUCOSE_CONTEXTS.find((c) => c.value === v)?.label ?? null;

// One-line summary of a measurement, e.g. "8 lb 4 oz · 21.5 in". Honors the unit
// the value was entered in. Returns null only if neither was recorded.
export function measurementSummary(m) {
  const parts = [formatWeight(m.weight_grams, m.weight_unit), formatHeight(m.height_cm, m.height_unit)].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

// Feeding sub-types (breast / bottle / both)
export const FEED_TYPE_META = {
  breast: { label: 'Breast feed', color: 'var(--c-breast)' },
  bottle: { label: 'Bottle', color: 'var(--c-bottle)' },
  both: { label: 'Combo feed', color: 'var(--c-both)' },
};

/* ----------------------- stool (dirty diaper) detail ----------------------- */

// How much — ordered light → blowout.
export const STOOL_AMOUNTS = [
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
  { value: 'blowout', label: 'Blowout' },
];

// Common infant stool colors with a representative swatch.
export const STOOL_COLORS = [
  { value: 'yellow', label: 'Yellow', hex: '#e3b505' },
  { value: 'green', label: 'Green', hex: '#6f8f3a' },
  { value: 'brown', label: 'Brown', hex: '#7a5230' },
  { value: 'tan', label: 'Tan', hex: '#c2a878' },
  { value: 'orange', label: 'Orange', hex: '#d98a2b' },
  { value: 'black', label: 'Black', hex: '#2b2b2b' },
  { value: 'red', label: 'Red', hex: '#b03a3a' },
];

// Five textures.
export const STOOL_TEXTURES = [
  { value: 'runny', label: 'Runny' },
  { value: 'seedy', label: 'Seedy' },
  { value: 'pasty', label: 'Pasty' },
  { value: 'mushy', label: 'Mushy' },
  { value: 'pebbles', label: 'Pebbles' },
];

const labelFrom = (list, value) => list.find((o) => o.value === value)?.label ?? null;
export const stoolAmountLabel = (v) => labelFrom(STOOL_AMOUNTS, v);
export const stoolTextureLabel = (v) => labelFrom(STOOL_TEXTURES, v);
export const stoolColor = (v) => STOOL_COLORS.find((c) => c.value === v) ?? null;
