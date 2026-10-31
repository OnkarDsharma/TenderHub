/**
 * @file frontend/src/components/shared/BentoTile.jsx
 * @description Bento tile used across the AI dossier and the tender detail
 * pages: light (with a faint grid texture), blue, or dark navy, with a
 * staggered blur-and-rise reveal. Styles live under `.ai-tile` in index.css.
 */
import { motion } from 'framer-motion';

const tileReveal = {
  hidden: { opacity: 0, y: -16, filter: 'blur(10px)' },
  visible: (i) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: { delay: i * 0.08, duration: 0.45, ease: 'easeOut' } }),
};

export function Tile({ tone = 'light', size, order = 0, className = '', children }) {
  return (
    <motion.div
      custom={order}
      variants={tileReveal}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      className={`ai-tile ai-tile--${tone} ${size ? `ai-tile--${size}` : ''} ${className}`}
    >
      {tone === 'light' && <span className="ai-tile-grid" aria-hidden="true" />}
      <div className="ai-tile-body">{children}</div>
    </motion.div>
  );
}
