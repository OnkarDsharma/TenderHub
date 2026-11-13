/**
 * @file src/components/tenders/detail/TenderDetailUI.jsx
 * @description Building blocks for the tender details page ("the bid file"):
 * panels, spec-sheet groups, label/value fields, Yes/No flags and chips.
 * Styles live in tender-details.css under the `td-` prefix.
 */

import { isBlank } from './detailFormat';

/** Page-level panel with a plain heading (no icon tile) and an optional action. */
export function Section({ title, description, action, id, className = '', children }) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={`td-panel ${className}`}>
      {(title || action) && (
        <header className="td-panel-head">
          <div className="min-w-0">
            {title && <h2 id={headingId} className="td-panel-title">{title}</h2>}
            {description && <p className="td-panel-desc">{description}</p>}
          </div>
          {action && <div className="td-panel-action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Spec-sheet row: plain group name in a narrow left column, fields on the right. */
export function SheetGroup({ title, children }) {
  return (
    <div className="td-sheet">
      <h3 className="td-sheet-title">{title}</h3>
      <div className="td-sheet-body">{children}</div>
    </div>
  );
}

/** Two-column definition list separated by hairlines. */
export function Fields({ columns = 2, children }) {
  return <dl className={`td-fields td-fields--${columns}`}>{children}</dl>;
}

/**
 * One label/value pair. Blank values are shown as "N/A", never hidden.
 * `wide` spans both columns; `variant` is 'emphasis' | 'prose' | 'prose-strong'.
 */
export function Field({ label, value, mono = false, wide = false, variant, children }) {
  const content = children ?? value;
  const blank = typeof content !== 'object' && isBlank(content);
  const variantClass = variant === 'emphasis' ? 'td-emphasis'
    : variant === 'prose' ? 'td-prose'
    : variant === 'prose-strong' ? 'td-prose td-prose--strong' : '';
  return (
    <div className={`td-field ${wide ? 'td-field--wide' : ''}`}>
      <dt>{label}</dt>
      <dd className={`${mono ? 'td-mono' : ''} ${variantClass} ${blank ? 'td-blank' : ''}`}>
        {blank ? 'N/A' : content}
      </dd>
    </div>
  );
}

/** Row of Yes/No chips. */
export function Flags({ children }) {
  return <ul className="td-flags">{children}</ul>;
}

/** One labelled Yes/No chip. Shows the portal's value verbatim; blanks read "N/A". */
export function Flag({ label, value }) {
  const blank = isBlank(value);
  const text = blank ? 'N/A' : String(value);
  const tone = blank ? 'na' : /^y(es)?$/i.test(text.trim()) ? 'yes' : 'no';
  return (
    <li className={`td-flag td-flag--${tone}`}>
      <span>{label}</span>
      <b>{text}</b>
    </li>
  );
}

/** Small chip. Tones: neutral, code, cobalt, ready, status. */
export function Chip({ tone = 'neutral', className = '', children, ...rest }) {
  return <span className={`td-chip td-chip--${tone} ${className}`} {...rest}>{children}</span>;
}
