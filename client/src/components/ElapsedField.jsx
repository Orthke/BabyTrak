// Hour / minute dropdowns for an elapsed span ("how long ago did this start?").
// Native <select>s for the same reason DateTimeField uses them: they're the only
// time control that shows the same fixed options on desktop, Android, and iOS,
// so the minute list is guaranteed to step by `step` (default 5 min).
// Value and onChange are in whole minutes.

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function ElapsedField({ value, onChange, step = 300, maxHours = 23 }) {
  const stepMin = Math.max(1, Math.round(step / 60));
  const total = Math.max(0, Math.round(value || 0));
  const h = Math.min(maxHours, Math.floor(total / 60));
  const m = total % 60;

  const minutes = [];
  for (let mm = 0; mm < 60; mm += stepMin) minutes.push(mm);
  if (!minutes.includes(m)) minutes.push(m); // keep an off-grid value selectable
  minutes.sort((a, b) => a - b);

  const set = (patch) => onChange((patch.h ?? h) * 60 + (patch.m ?? m));

  return (
    <div className="time-selects">
      <select className="select compact" value={h} onChange={(e) => set({ h: Number(e.target.value) })}>
        {HOURS.filter((n) => n <= maxHours).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <span className="time-unit">hr</span>
      <select className="select compact" value={m} onChange={(e) => set({ m: Number(e.target.value) })}>
        {minutes.map((mm) => (
          <option key={mm} value={mm}>
            {mm}
          </option>
        ))}
      </select>
      <span className="time-unit">min</span>
    </div>
  );
}
