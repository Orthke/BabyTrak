import { Eye, EyeSlash } from '../icons.jsx';

// The eye control shown on each track card while reordering. Tapping it hides the
// card (so it drops off the Track view and the history/timeline filter) or shows
// it again. It's a span, not a button, so it can live inside the card's own
// <button> without nesting buttons; clicks are stopped so it never opens the card.
export default function HideToggle({ hidden, onToggle }) {
  const Icon = hidden ? EyeSlash : Eye;
  const act = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  };
  return (
    <span
      className={`hide-toggle ${hidden ? 'hidden' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={hidden ? 'Show card' : 'Hide card'}
      aria-pressed={hidden}
      title={hidden ? 'Show this card' : 'Hide this card'}
      onClick={act}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') act(e);
      }}
    >
      <Icon size={18} />
    </span>
  );
}
