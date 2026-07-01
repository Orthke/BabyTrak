import { GripVertical } from '../icons.jsx';

// The only part of a track card that starts a drag. Clicks are stopped so
// tapping the grip never opens the card; `.drag-handle` sets touch-action:none
// so it drags on touch while the rest of the card stays scrollable.
export default function DragHandle({ handleProps }) {
  return (
    <span
      className="drag-handle"
      aria-label="Drag to reorder"
      title="Drag to reorder"
      onClick={(e) => e.stopPropagation()}
      {...handleProps}
    >
      <GripVertical size={20} />
    </span>
  );
}
