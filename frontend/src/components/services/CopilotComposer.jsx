/**
 * @file frontend/src/components/services/CopilotComposer.jsx
 * @description Expanding prompt input for the tender copilot. Rests as a
 * 48px pill; grows into a card with a textarea, a context chip and a send button when focused or when it holds text. Spring-eased
 * height and width, in the site's navy and blue.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Search } from 'lucide-react';

const SPRING = 'cubic-bezier(0.175, 0.885, 0.32, 1.275)';

export function CopilotComposer({
  value,
  onChange,
  onSubmit,
  disabled = false,
  loading = false,
  tenderRef = '',
  placeholder = 'Ask about this tender',
}) {
  const [expandedState, setExpanded] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState(60);
  const rootRef = useRef(null);
  const textareaRef = useRef(null);

  const hasValue = value.trim() !== '';
  // Text keeps the card open; clearing it lets the card close again.
  const expanded = expandedState || hasValue;

  useEffect(() => {
    if (!expanded) return undefined;
    const t = setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 40);
    return () => clearTimeout(t);
  }, [expanded]);

  // Auto-size the textarea between 60 and 160px.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.max(60, Math.min(el.scrollHeight, 160));
    el.style.height = `${next}px`;
    setTextareaHeight(next);
  }, [value, expanded]);

  const collapse = () => setExpanded(false);

  const handleBlur = (e) => {
    if (rootRef.current && rootRef.current.contains(e.relatedTarget)) return;
    if (!hasValue) collapse();
  };

  const submit = () => {
    if (!hasValue || disabled || loading) return;
    onSubmit();
  };

  const height = expanded ? textareaHeight + 52 : 48;

  return (
    <div
      ref={rootRef}
      onBlur={handleBlur}
      className="ai-composer"
      style={{ maxWidth: expanded ? 640 : 420, transition: `max-width 0.4s ${SPRING}` }}
    >
      <div
        className={`ai-composer-card ${expanded ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}
        style={{ height, transition: `height 0.4s ${SPRING}` }}
        onMouseDown={(e) => {
          if (expanded && e.target !== textareaRef.current) { e.preventDefault(); textareaRef.current?.focus(); }
        }}
      >
        {/* Collapsed label */}
        <button
          type="button"
          className={`ai-composer-label ${expanded ? 'is-hidden' : ''}`}
          onClick={() => { if (!disabled) setExpanded(true); }}
          disabled={disabled}
          aria-label="Open the copilot prompt"
        >
          {placeholder}
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === 'Escape' && !hasValue) collapse();
          }}
          placeholder={placeholder}
          aria-label="Message the copilot"
          disabled={disabled}
          className={`ai-composer-textarea ${expanded ? '' : 'is-hidden'}`}
        />

        {/* Bottom actions */}
        <div className={`ai-composer-actions ${expanded ? '' : 'is-hidden'}`}>
          {tenderRef && (
            <span className="ai-composer-chip" title="The copilot answers from this tender and your profile">
              <Search className="w-3 h-3" />
              <span className="font-mono">{tenderRef}</span>
            </span>
          )}

        </div>

        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => { if (!expanded) setExpanded(true); else submit(); }}
          disabled={disabled || loading || (expanded && !hasValue)}
          aria-label={expanded ? 'Send' : 'Open the copilot prompt'}
          className="ai-composer-send"
        >
          <ArrowUp className={`w-4 h-4 transition-transform duration-300 ${loading ? 'animate-pulse' : ''}`} />
        </button>
      </div>
    </div>
  );
}
