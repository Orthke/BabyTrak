import { pad } from '../utils.js';

// A date picker plus hour / minute / AM-PM dropdowns. Native <select>s are the
// only time control that shows the same fixed options on desktop, Android, and
// iOS — so the minute list is guaranteed to step by `step` (default 5 min).
// Value is the same "YYYY-MM-DDTHH:mm" local string used by datetime-local.

function parse(value) {
  const [date = '', time = '00:00'] = (value || '').split('T');
  const h24 = Number(time.slice(0, 2)) || 0;
  const m = Number(time.slice(3, 5)) || 0;
  return { date, h24, m, ampm: h24 >= 12 ? 'PM' : 'AM', h12: h24 % 12 === 0 ? 12 : h24 % 12 };
}

function compose(date, h12, m, ampm) {
  let h24 = h12 % 12;
  if (ampm === 'PM') h24 += 12;
  return `${date}T${pad(h24)}:${pad(m)}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function DateTimeField({ value, onChange, step = 300 }) {
  const { date, h12, m, ampm } = parse(value);
  const stepMin = Math.max(1, Math.round(step / 60));

  const minutes = [];
  for (let mm = 0; mm < 60; mm += stepMin) minutes.push(mm);
  if (!minutes.includes(m)) minutes.push(m); // keep an off-grid value (legacy data) selectable
  minutes.sort((a, b) => a - b);

  const set = (patch) =>
    onChange(compose(patch.date ?? date, patch.h12 ?? h12, patch.m ?? m, patch.ampm ?? ampm));

  return (
    <div className="datetime-field">
      <input type="date" value={date} onChange={(e) => set({ date: e.target.value })} />
      <div className="time-selects">
        <select className="select compact" value={h12} onChange={(e) => set({ h12: Number(e.target.value) })}>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="time-colon">:</span>
        <select className="select compact" value={m} onChange={(e) => set({ m: Number(e.target.value) })}>
          {minutes.map((mm) => (
            <option key={mm} value={mm}>
              {pad(mm)}
            </option>
          ))}
        </select>
        <select className="select compact" value={ampm} onChange={(e) => set({ ampm: e.target.value })}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}
