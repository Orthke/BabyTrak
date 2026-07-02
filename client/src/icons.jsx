// Central icon registry so icon choices live in one place and usage stays consistent.
import {
  HeartFill,
  CupStraw,
  Cup,
  Droplet,
  DropletHalf,
  CircleFill,
  CapsulePill,
  Trophy,
  MoonStars,
  Rulers,
  Thermometer,
  HeartPulse,
  GenderMale,
  GenderFemale,
  GenderAmbiguous,
  PersonFill,
} from 'react-bootstrap-icons';

// Custom diaper glyph. Matches the react-bootstrap-icons API (size/color props,
// 16×16 viewBox, currentColor fill) so it drops in wherever those icons are used.
// A waistband tapering to a rounded crotch — a nappy/brief silhouette.
export function Diaper({ size = 16, color, className, title, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={color ?? 'currentColor'}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title && <title>{title}</title>}
      <path
        fillRule="evenodd"
        d="M2.5 3H13.5A1.5 1.5 0 0 1 15 4.5V5C15 10 12 13.5 8 14.5C4 13.5 1 10 1 5V4.5A1.5 1.5 0 0 1 2.5 3ZM4.65 6.98C3.68 6.9 2.84 6.62 2.24 6.19C2.7 9.62 4.96 12.22 8 13.05C11.04 12.22 13.3 9.62 13.76 6.19C13.16 6.62 12.32 6.9 11.35 6.98C11.06 9.55 9.83 11.48 8 12.28C6.17 11.48 4.94 9.55 4.65 6.98Z"
      />
    </svg>
  );
}

// Caregivers (parents/others)
export const CAREGIVER_ICON = PersonFill;

// Top-level entry kinds (the Track buttons / timeline groups)
export const KIND_ICONS = {
  feed: Cup,
  pump: DropletHalf,
  diaper: Diaper,
  med: CapsulePill,
  milestone: Trophy,
  sleep: MoonStars,
  measurement: Rulers,
  temperature: Thermometer,
  bp: HeartPulse,
};

// Feeding sub-types
export const FEED_TYPE_ICONS = {
  breast: HeartFill,
  bottle: CupStraw,
  both: Cup,
};

// Diaper contents
export const CONTENT_ICONS = {
  wet: Droplet,
  dirty: CircleFill,
};

// Gender
export const GENDER_ICONS = {
  boy: GenderMale,
  girl: GenderFemale,
  unspecified: GenderAmbiguous,
};

// Re-export the icons used directly throughout the UI.
export {
  HeartFill,
  CupStraw,
  Droplet,
  DropletHalf,
  CapsulePill,
  Trophy,
  PlusCircleFill,
  GraphUp,
  ClockHistory,
  PlayFill,
  PauseFill,
  StopFill,
  Pencil,
  Trash3,
  XLg,
  Check,
  ChevronDown,
  Stopwatch,
  MoonStars,
  InboxFill,
  BarChartLineFill,
  Calendar3,
  Speedometer2,
  Rulers,
  Plus,
  PersonFill,
  PersonPlus,
  GripVertical,
  Funnel,
  FunnelFill,
} from 'react-bootstrap-icons';
