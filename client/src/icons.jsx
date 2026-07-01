// Central icon registry so icon choices live in one place and usage stays consistent.
import {
  HeartFill,
  CupStraw,
  Cup,
  Moisture,
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

// Caregivers (parents/others)
export const CAREGIVER_ICON = PersonFill;

// Top-level entry kinds (the Track buttons / timeline groups)
export const KIND_ICONS = {
  feed: Cup,
  pump: DropletHalf,
  diaper: Moisture,
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
  Moisture,
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
