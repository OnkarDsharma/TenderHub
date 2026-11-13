/**
 * @file src/components/tenders/detail/BidBar.jsx
 * @description Slim glass bar that appears under the site navigation once the
 * tender header has scrolled away: tender ID, value, EMD, time to close and
 * Save. Labels are configurable so GeM bids can reuse it. On phones it keeps ID, time to close and Save.
 */
import { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';

/** Fires `onChange(true)` once the element it marks has scrolled above the viewport. */
export function ScrollSentinel({ onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      onChange(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onChange]);
  return <div ref={ref} aria-hidden="true" />;
}

export function BidBar({
  show, tenderId, value, emd, timeToClose, closed, bookmarked, onSave,
  idLabel = 'Tender ID', saveLabel = 'Save Tender', savedLabel = 'Saved in Watchlist',
}) {
  // Sit just under the sticky site navigation.
  const [top, setTop] = useState(72);
  useEffect(() => {
    const measure = () => {
      const nav = document.querySelector('header.sticky');
      if (nav) setTop(nav.getBoundingClientRect().height);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div className={`td-bidbar ${show ? 'is-on' : ''}`} style={{ top }} inert={!show}>
      <div className="td-bidbar-inner">
        <div className="td-bidbar-item td-bidbar-item--id">
          <span>{idLabel}</span>
          <strong>{tenderId}</strong>
        </div>
        {value !== undefined && (
          <div className="td-bidbar-item td-bidbar-item--hide-sm">
            <span>Tender value</span>
            <strong>{value}</strong>
          </div>
        )}
        <div className="td-bidbar-item td-bidbar-item--hide-sm">
          <span>EMD deposit</span>
          <strong>{emd}</strong>
        </div>
        <div className={`td-bidbar-item ${closed ? '' : 'td-bidbar-item--deadline'}`}>
          <span>Time to close</span>
          <strong>{timeToClose}</strong>
        </div>
        <button
          type="button"
          onClick={onSave}
          aria-pressed={bookmarked}
          className={`td-btn td-btn--sm ${bookmarked ? 'td-btn--saved' : 'td-btn--primary'}`}
        >
          <Heart className={bookmarked ? 'fill-current' : ''} />
          {bookmarked ? savedLabel : saveLabel}
        </button>
      </div>
    </div>
  );
}
