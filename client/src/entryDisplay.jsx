// Shared rendering helpers for a single timeline entry: the one-line
// description shown in a row, the edit-modal header, and the map from kind to
// its edit form. Used by both the History and Timeline pages so an entry reads
// and edits identically wherever it appears.
import {
  formatTime,
  formatDuration,
  formatMinutes,
  sleepSeconds,
  KIND_META,
  FEED_TYPE_META,
  stoolAmountLabel,
  stoolTextureLabel,
  stoolColor,
  measurementSummary,
  formatTemp,
  tempMethodLabel,
  formatBP,
  formatBloodSugar,
  glucoseContextLabel,
} from './utils.js';
import { KIND_ICONS, FEED_TYPE_ICONS, CONTENT_ICONS } from './icons.jsx';
import FeedForm from './forms/FeedForm.jsx';
import PumpForm from './forms/PumpForm.jsx';
import DiaperForm from './forms/DiaperForm.jsx';
import MedForm from './forms/MedForm.jsx';
import MilestoneForm from './forms/MilestoneForm.jsx';
import MeasurementForm from './forms/MeasurementForm.jsx';
import TemperatureForm from './forms/TemperatureForm.jsx';
import BloodPressureForm from './forms/BloodPressureForm.jsx';
import BloodSugarForm from './forms/BloodSugarForm.jsx';
import SleepForm from './forms/SleepForm.jsx';

const WetIcon = CONTENT_ICONS.wet;
const DirtyIcon = CONTENT_ICONS.dirty;

export const FORM_BY_KIND = {
  feed: FeedForm,
  pump: PumpForm,
  diaper: DiaperForm,
  med: MedForm,
  milestone: MilestoneForm,
  measurement: MeasurementForm,
  temperature: TemperatureForm,
  bp: BloodPressureForm,
  sugar: BloodSugarForm,
  sleep: SleepForm,
};

// Title + icon for the edit modal header, per timeline item.
export function editHeader(item) {
  if (item.kind === 'feed') {
    return { label: FEED_TYPE_META[item.type].label, color: FEED_TYPE_META[item.type].color, Icon: FEED_TYPE_ICONS[item.type] };
  }
  const meta = KIND_META[item.kind];
  return { label: meta.label, color: meta.color, Icon: KIND_ICONS[item.kind] };
}

export function describe(item) {
  if (item.kind === 'feed') {
    const total = item.left_seconds + item.right_seconds;
    const milk = item.milk_type === 'formula' ? 'Formula' : 'Breast milk';
    const nursing = `L ${formatDuration(item.left_seconds)} · R ${formatDuration(item.right_seconds)}`;
    const bottle = `${item.amount} ${item.unit}`;
    const bottleDur = item.bottle_seconds ? `${formatDuration(item.bottle_seconds)} · ` : '';
    if (item.type === 'bottle') {
      return { title: `Bottle · ${bottle}`, sub: `${bottleDur}${milk}` };
    }
    if (item.type === 'both') {
      return {
        title: `Combo · ${formatDuration(total)} + ${bottle}`,
        sub: `${nursing} · ${bottleDur}${bottle} ${milk}`,
      };
    }
    // breast
    return { title: `Breast feed · ${formatDuration(total)}`, sub: `${nursing} · ${milk}` };
  }
  if (item.kind === 'pump') {
    const vol = item.amount != null ? `${item.amount} ${item.unit}` : 'volume n/a';
    return {
      title: `Pump · ${vol}`,
      sub: item.duration_seconds ? `${formatDuration(item.duration_seconds)} session` : 'Pumping',
    };
  }
  if (item.kind === 'med') {
    const dose = item.amount != null ? `${item.amount} ${item.unit}` : 'dose n/a';
    return { title: item.name, sub: `Medication · ${dose}` };
  }
  if (item.kind === 'milestone') {
    return { title: item.name, sub: 'Milestone' };
  }
  if (item.kind === 'measurement') {
    const summary = measurementSummary(item);
    return { title: summary ?? 'Measurement', sub: 'Measurement' };
  }
  if (item.kind === 'temperature') {
    const method = tempMethodLabel(item.method);
    return {
      title: formatTemp(item.temp, item.unit) ?? 'Temperature',
      sub: method ? `Temperature · ${method}` : 'Temperature',
    };
  }
  if (item.kind === 'bp') {
    return {
      title: `${formatBP(item.systolic, item.diastolic) ?? 'Blood pressure'} mmHg`,
      sub: item.pulse != null ? `Blood pressure · ${item.pulse} bpm` : 'Blood pressure',
    };
  }
  if (item.kind === 'sugar') {
    const ctx = glucoseContextLabel(item.context);
    return {
      title: formatBloodSugar(item.value, item.unit) ?? 'Blood sugar',
      sub: ctx ? `Blood sugar · ${ctx}` : 'Blood sugar',
    };
  }
  if (item.kind === 'sleep') {
    if (!item.end_time) return { title: 'Sleep · in progress', sub: `Since ${formatTime(item.start_time)}` };
    return {
      title: `Sleep · ${formatMinutes(sleepSeconds(item))}`,
      sub: `${formatTime(item.start_time)} – ${formatTime(item.end_time)}`,
    };
  }
  // diaper
  const swatch = stoolColor(item.stool_color);
  const stoolBits = [stoolAmountLabel(item.stool_amount), stoolTextureLabel(item.stool_texture)].filter(Boolean);
  return {
    title: 'Diaper',
    sub: (
      <>
        {item.wet && (
          <span className="inline-ico">
            <WetIcon size={13} color="var(--c-wet)" /> Wet
          </span>
        )}
        {item.dirty && (
          <span className="inline-ico">
            <DirtyIcon size={12} color="var(--c-dirty)" /> Dirty
          </span>
        )}
        {item.dirty && swatch && (
          <span className="inline-ico">
            <span className="stool-dot" style={{ background: swatch.hex }} /> {swatch.label}
          </span>
        )}
        {item.dirty && stoolBits.length > 0 && <span className="inline-ico">{stoolBits.join(' · ')}</span>}
        {!item.wet && !item.dirty && '—'}
      </>
    ),
  };
}
