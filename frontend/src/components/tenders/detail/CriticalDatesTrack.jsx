/**
 * @file src/components/tenders/detail/CriticalDatesTrack.jsx
 * @description Critical dates as one horizontal track scaled to real time, with
 * a "today" marker and the elapsed part filled. Milestones sharing a timestamp
 * are grouped under one node with every name listed. Labels that would collide
 * drop to a second lane. Below 768px it becomes a vertical list in time order.
 * Milestones without a parseable date are listed underneath, never dropped.
 */
import { useEffect, useRef, useState } from 'react';

import { relativeDays } from './detailFormat';

const LABEL_PX = 152;   // approximate rendered width of one label block
const EDGE = 3;         // % of padding at each end of the track

export function CriticalDatesTrack({ dates, nowMs }) {
  const lanesRef = useRef(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    const node = lanesRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || 900));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Group dated milestones by exact timestamp, keeping the portal's order inside a group.
  const byTime = new Map();
  const undated = [];
  dates.forEach((d) => {
    if (!d.when) { undated.push(d); return; }
    const t = d.when.getTime();
    if (!byTime.has(t)) byTime.set(t, { t, when: d.when, items: [] });
    byTime.get(t).items.push(d);
  });
  const groups = [...byTime.values()].sort((a, b) => a.t - b.t);
  const nextIdx = groups.findIndex((g) => g.t > nowMs);

  const min = groups[0]?.t ?? nowMs;
  const max = groups[groups.length - 1]?.t ?? nowMs;
  const span = max - min;
  const pos = (t) => (span ? EDGE + ((100 - 2 * EDGE) * (t - min)) / span : 50);
  const todayPct = Math.max(0, Math.min(100, span ? pos(nowMs) : (nowMs >= min ? 100 : 0)));

  // Lane assignment: first lane where the label does not overlap the previous one.
  const w = (LABEL_PX / Math.max(width, 1)) * 100;
  const laneEnds = [];
  const placed = groups.map((g, i) => {
    const p = pos(g.t);
    const align = p - w / 2 < 0 ? 'l' : p + w / 2 > 100 ? 'r' : 'c';
    const start = align === 'l' ? p : align === 'r' ? p - w : p - w / 2;
    let lane = laneEnds.findIndex((end) => end + 1 <= start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = start + w;
    return { ...g, p, align, lane, passed: g.t <= nowMs, isNext: i === nextIdx };
  });
  const laneCount = Math.max(1, laneEnds.length);
  const laneHeights = Array.from({ length: laneCount }, (_, lane) => {
    const names = Math.max(1, ...placed.filter((g) => g.lane === lane).map((g) => g.items.length));
    return names * 18 + 76;
  });

  const state = (g) => `${g.passed ? 'is-passed' : ''} ${g.isNext ? 'is-next' : ''}`;
  const when = (g) => g.items[0];

  // Vertical list with a Today row in time order.
  const todayAt = nextIdx === -1 ? placed.length : nextIdx;
  const vRows = [...placed];
  if (placed.length) vRows.splice(todayAt, 0, { today: true });

  return (
    <>
      {placed.length > 0 && (
        <div className="td-track" style={{ '--td-elapsed': `${todayPct}%` }}>
          <div className="td-track-rail">
            <div className="td-track-fill" />
            <div className="td-today" style={{ left: `${todayPct}%` }}><span>Today</span></div>
            {placed.map((g) => (
              <span
                key={g.t}
                className={`td-node ${state(g)}`}
                style={{ left: `${g.p}%` }}
                title={g.items.map((d) => d.label).join(', ')}
              />
            ))}
          </div>
          <div className="td-lanes" ref={lanesRef}>
            {laneHeights.map((h, lane) => (
              <div key={lane} className="td-lane" style={{ height: h }}>
                {placed.filter((g) => g.lane === lane).map((g) => (
                  <div key={g.t} className={`td-mark is-${g.align} ${state(g)}`} style={{ left: `${g.p}%` }}>
                    <span className="td-mark-names">{g.items.map((d) => <span key={d.label}>{d.label}</span>)}</span>
                    <span className="td-mark-day" style={{ display: 'block' }}>{when(g).datePart}</span>
                    {when(g).timePart && <span className="td-mark-time" style={{ display: 'block' }}>{when(g).timePart}</span>}
                    <span className="td-mark-rel" style={{ display: 'block' }}>{g.isNext ? `Next · ${relativeDays(g.when, nowMs)}` : relativeDays(g.when, nowMs)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {placed.length > 0 && (
        <ol className="td-vlist">
          {vRows.map((g, i) => (g.today ? (
            <li key="today" className="td-vrow td-vrow--today"><span className="td-vdot" aria-hidden="true" /><span>Today</span></li>
          ) : (
            <li key={g.t ?? i} className={`td-vrow ${state(g)}`} aria-current={g.isNext ? 'step' : undefined}>
              <span className="td-vdot" aria-hidden="true" />
              <span className="td-vnames">{g.items.map((d) => <span key={d.label}>{d.label}</span>)}</span>
              <span className="td-vwhen">
                <strong>{when(g).datePart}</strong>
                {when(g).timePart && <span>{when(g).timePart}</span>}
              </span>
              <span className="td-vrel">{g.isNext ? `Next · ${relativeDays(g.when, nowMs)}` : relativeDays(g.when, nowMs)}</span>
            </li>
          )))}
        </ol>
      )}

      {undated.length > 0 && (
        <p className="td-undated">
          {undated.map((d, i) => (
            <span key={d.label}>
              {i > 0 && ' · '}
              <strong>{d.label}</strong> {d.datePart}{d.timePart ? `, ${d.timePart}` : ''}
            </span>
          ))}
        </p>
      )}
    </>
  );
}
