/**
 * @file src/components/tenders/detail/CriticalDatesTrack.jsx
 * @description Critical dates as one horizontal track scaled to real time, with
 * a "today" marker and the elapsed part filled. Milestones sharing a timestamp
 * are grouped under one numbered node, labelled "n milestones · same date & time"
 * with every name listed. Crowded labels are nudged sideways with a connector
 * line back to their node; a second row is used only when the row is too narrow. Below 768px it becomes a vertical list in time order.
 * Milestones without a parseable date are listed underneath, never dropped.
 */
import { useEffect, useRef, useState } from 'react';

import { relativeDays } from './detailFormat';

const LABEL_PX = 168;   // width of one label block
const GAP = 14;         // minimum space between labels
const LEADER_PX = 18;   // height of the connector band between track and labels
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

  // Label layout (px). Labels sit centred under their node; when neighbours would
  // overlap they are nudged sideways on the same row and a connector line leads
  // back to the node. Only if the row is genuinely too narrow do labels drop to
  // further rows.
  const W = Math.max(width, 1);
  const n = groups.length;
  const base = groups.map((g, i) => ({ ...g, p: pos(g.t), c: (pos(g.t) / 100) * W, passed: g.t <= nowMs, isNext: i === nextIdx }));
  let placed;
  let laneCount = 1;
  if (n * LABEL_PX + (n - 1) * GAP <= W) {
    const lefts = base.map((g) => Math.min(Math.max(g.c - LABEL_PX / 2, 0), W - LABEL_PX));
    for (let i = 1; i < n; i += 1) lefts[i] = Math.max(lefts[i], lefts[i - 1] + LABEL_PX + GAP);
    if (n) lefts[n - 1] = Math.min(lefts[n - 1], W - LABEL_PX);
    for (let i = n - 2; i >= 0; i -= 1) lefts[i] = Math.min(lefts[i], lefts[i + 1] - LABEL_PX - GAP);
    placed = base.map((g, i) => ({ ...g, left: lefts[i], lane: 0 }));
  } else {
    const laneEnds = [];
    placed = base.map((g) => {
      const left = Math.min(Math.max(g.c - LABEL_PX / 2, 0), W - LABEL_PX);
      let lane = laneEnds.findIndex((end) => end + GAP <= left);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = left + LABEL_PX;
      return { ...g, left, lane };
    });
    laneCount = laneEnds.length;
  }
  const laneHeights = Array.from({ length: laneCount }, (_, lane) => {
    const rows = placed.filter((g) => g.lane === lane);
    const names = Math.max(1, ...rows.map((g) => g.items.length));
    const shared = rows.some((g) => g.items.length > 1);
    return names * 18 + (shared ? 24 : 0) + 78;
  });

  const state = (g) => `${g.passed ? 'is-passed' : ''} ${g.isNext ? 'is-next' : ''}`;
  const when = (g) => g.items[0];
  const rel = (g) => (g.isNext ? `Next · ${relativeDays(g.when, nowMs)}` : relativeDays(g.when, nowMs));
  const sharedNote = (g) => (g.items.length > 1 ? `${g.items.length} milestones · same date & time` : null);

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
                className={`td-node ${g.items.length > 1 ? 'td-node--multi' : ''} ${state(g)}`}
                style={{ left: `${g.p}%` }}
                title={g.items.map((d) => d.label).join(', ')}
              >
                {g.items.length > 1 ? g.items.length : null}
              </span>
            ))}
          </div>
          <div className="td-lanes" ref={lanesRef}>
            {laneHeights.map((h, lane) => (
              <div key={lane} className="td-lane" style={{ height: h + (lane ? 0 : LEADER_PX) }}>
                {lane === 0 && (
                  <svg className="td-leaders" width={W} height={LEADER_PX} aria-hidden="true">
                    {placed.filter((g) => g.lane === 0).map((g) => {
                      const mid = g.left + LABEL_PX / 2;
                      return <path key={g.t} className={state(g)} d={`M${g.c} 0 V6 H${mid} V${LEADER_PX}`} />;
                    })}
                  </svg>
                )}
                {placed.filter((g) => g.lane === lane).map((g) => (
                  <div
                    key={g.t}
                    className={`td-mark ${state(g)}`}
                    style={{ left: g.left, width: LABEL_PX, top: lane ? 0 : LEADER_PX }}
                  >
                    {sharedNote(g) && <span className="td-mark-same">{sharedNote(g)}</span>}
                    <span className="td-mark-names">{g.items.map((d) => <span key={d.label}>{d.label}</span>)}</span>
                    <span className="td-mark-day">{when(g).datePart}</span>
                    {when(g).timePart && <span className="td-mark-time">{when(g).timePart}</span>}
                    <span className="td-mark-rel">{rel(g)}</span>
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
              <span className={`td-vdot ${g.items.length > 1 ? 'td-vdot--multi' : ''}`} aria-hidden="true">{g.items.length > 1 ? g.items.length : null}</span>
              <span className="td-vnames">
                {sharedNote(g) && <span className="td-mark-same">{sharedNote(g)}</span>}
                {g.items.map((d) => <span key={d.label}>{d.label}</span>)}
              </span>
              <span className="td-vwhen">
                <strong>{when(g).datePart}</strong>
                {when(g).timePart && <span>{when(g).timePart}</span>}
              </span>
              <span className="td-vrel">{rel(g)}</span>
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
