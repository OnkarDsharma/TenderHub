/**
 * @file src/components/tenders/detail/TenderDetailUI.jsx
 * @description Layout building blocks for the tender details page: section
 * surfaces, information-sheet groups, label/value fields, stats, badges and
 * document rows. Styles live in tender-details.css under the `td-` prefix.
 */

import { isBlank } from './detailFormat';

/**
 * Section surface. `variant` gives each content type its own identity:
 * 'plain' (default white sheet), 'tint' (slate-blue surface), 'navy' (financial anchor).
 */
export function Section({ title, description, action, icon, id, variant = 'plain', className = '', children }) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={`td-card td-card--${variant} ${className}`}>
      {(title || action) && (
        <header className="td-card-head">
          <div className="td-card-heading">
            {icon && <span className="td-card-icon" aria-hidden="true">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 id={headingId} className="td-card-title">{title}</h2>}
              {description && <p className="td-card-desc">{description}</p>}
            </div>
          </div>
          {action && <div className="td-card-action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Information-sheet row: the group name sits in a left rail on wide screens and
 * above its fields on narrow ones.
 */
export function SheetGroup({ title, icon, children }) {
  return (
    <div className="td-sheet">
      <div className="td-sheet-rail">
        {icon && <span className="td-sheet-icon" aria-hidden="true">{icon}</span>}
        <h3 className="td-sheet-title">{title}</h3>
      </div>
      <div className="td-sheet-body">{children}</div>
    </div>
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

/** A headline number with its label, for values worth reading at a glance. */
export function Stat({ label, value, hint, tone = 'default' }) {
  const blank = typeof value !== 'object' && isBlank(value);
  return (
    <div className={`td-stat td-stat--${tone}`}>
      <dt>{label}</dt>
      <dd className={blank ? 'td-blank' : ''}>{blank ? 'N/A' : value}</dd>
      {hint && <dd className="td-stat-hint">{hint}</dd>}
    </div>
  );
}

/** Small status / type pill. */
export function Badge({ tone = 'neutral', className = '', children, ...rest }) {
  return <span className={`td-badge td-badge--${tone} ${className}`} {...rest}>{children}</span>;
}

/**
 * One document row in a file list: icon, full file name (wraps, never
 * truncated), type badge, description and size, with actions on the right
 * (below on mobile). `weight` lets primary documents read stronger than
 * supporting ones.
 */
export function DocRow({ icon, tone = 'neutral', name, typeLabel, description, size, actions, weight = 'normal' }) {
  return (
    <li className={`td-doc td-doc--${weight}`}>
      <div className={`td-doc-icon td-doc-icon--${tone}`}>{icon}</div>
      <div className="td-doc-body">
        <p className="td-doc-name">{name}</p>
        <p className="td-doc-meta">
          {typeLabel && <Badge tone={tone}>{typeLabel}</Badge>}
          {description && <span>{description}</span>}
          {size && <span className="td-doc-size">{size}</span>}
        </p>
      </div>
      {actions && <div className="td-doc-actions">{actions}</div>}
    </li>
  );
}
