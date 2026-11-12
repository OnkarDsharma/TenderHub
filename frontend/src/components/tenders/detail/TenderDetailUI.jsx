/**
 * @file src/components/tenders/detail/TenderDetailUI.jsx
 * @description Layout building blocks for the tender details page: section
 * cards, label/value fields, field groups, and document rows. Styles live in
 * tender-details.css under the `td-` prefix.
 */

import { isBlank } from './detailFormat';

/** Section card with a heading, optional description, and an optional action on the right. */
export function Section({ title, description, action, id, className = '', children }) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={`td-card ${className}`}>
      {(title || action) && (
        <header className="td-card-head">
          <div className="min-w-0">
            {title && <h2 id={headingId} className="td-card-title">{title}</h2>}
            {description && <p className="td-card-desc">{description}</p>}
          </div>
          {action && <div className="td-card-action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** A titled cluster of fields inside a section. */
export function FieldGroup({ title, children }) {
  return (
    <div className="td-group">
      {title && <h3 className="td-group-title">{title}</h3>}
      {children}
    </div>
  );
}

/** Label/value list. `columns` controls how many columns it uses on wide screens. */
export function Fields({ columns = 2, children }) {
  return <dl className={`td-fields td-fields--${columns}`}>{children}</dl>;
}

/**
 * One label/value pair. Blank values are always shown as "N/A" rather than
 * hidden, so a contractor can see the field exists. `wide` spans every column.
 */
export function Field({ label, value, mono = false, wide = false, emphasis = false }) {
  const blank = typeof value !== 'object' && isBlank(value);
  return (
    <div className={`td-field ${wide ? 'td-field--wide' : ''}`}>
      <dt>{label}</dt>
      <dd className={`${mono ? 'td-mono' : ''} ${emphasis ? 'td-emphasis' : ''} ${blank ? 'td-blank' : ''}`}>
        {blank ? 'N/A' : value}
      </dd>
    </div>
  );
}

/** Small status / type pill. */
export function Badge({ tone = 'neutral', className = '', children, ...rest }) {
  return <span className={`td-badge td-badge--${tone} ${className}`} {...rest}>{children}</span>;
}

/**
 * One document: icon, full file name (wraps, never truncated), type badge,
 * description and size, with the actions on the right (below on mobile).
 */
export function DocRow({ icon, tone = 'neutral', name, typeLabel, description, size, actions }) {
  return (
    <li className="td-doc">
      <div className={`td-doc-icon td-doc-icon--${tone}`}>{icon}</div>
      <div className="td-doc-body">
        <p className="td-doc-name">{name}</p>
        <p className="td-doc-meta">
          {typeLabel && <Badge tone={tone}>{typeLabel}</Badge>}
          {description && <span>{description}</span>}
          {size && <span className="td-mono">{size}</span>}
        </p>
      </div>
      {actions && <div className="td-doc-actions">{actions}</div>}
    </li>
  );
}
