/**
 * @file frontend/src/components/shared/Reveal.jsx
 * @description Scroll-triggered reveal. Wrap any block: once it enters the
 * viewport its direct children rise and sharpen one after another. Works on
 * existing markup because the animation is applied by CSS to `> *`.
 */
import { useRef } from 'react';
import { useInView } from 'framer-motion';

export function Reveal({ as: Tag = 'div', className = '', margin = '-80px', children, ...rest }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin });
  return (
    <Tag ref={ref} className={`reveal-stagger ${inView ? 'is-in' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
