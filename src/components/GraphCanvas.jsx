import { useState, useMemo, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';
import { useTheme, TYPE_SHAPE } from '../theme.jsx';

const MIN_W = 400, MIN_H = 400;

// Longest-path rank from each graph's source nodes (no incoming edge), used to
// bias layout left-to-right in edge direction instead of the force simulation's
// otherwise-arbitrary settling position. Bounded-iteration relaxation (like
// Bellman-Ford, taking max instead of min) so it terminates even when the graph
// has cycles (e.g. a nurture step looping back to Proposal) -- a back-edge just
// stops contributing once its target already has a higher rank.
function computeRanks(nodes, edges) {
  const inDegree = new Map(nodes.map((n) => [n.id, 0]));
  edges.forEach((e) => inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1));
  const rank = new Map(nodes.map((n) => [n.id, inDegree.get(n.id) === 0 ? 0 : -1]));
  if ([...rank.values()].every((r) => r !== 0)) nodes.forEach((n) => rank.set(n.id, 0)); // fully-cyclic fallback

  for (let i = 0; i < nodes.length; i++) {
    let changed = false;
    edges.forEach((e) => {
      const sourceRank = rank.get(e.source);
      if (sourceRank == null || sourceRank < 0) return;
      const candidate = sourceRank + 1;
      if (candidate > (rank.get(e.target) ?? -1)) {
        rank.set(e.target, candidate);
        changed = true;
      }
    });
    if (!changed) break;
  }
  nodes.forEach((n) => { if ((rank.get(n.id) ?? -1) < 0) rank.set(n.id, 0); });
  return rank;
}

// Force-layout strength/distance are re-tuned looser than the original prototype's
// fixed 30-node values, since this tool targets 50-100 node graphs where the
// original -260 charge would produce heavy overlap. Bounds are now the measured
// container size, not a fixed pixel canvas, so more browser space means more
// room to lay nodes out and drag them into, not just a bigger picture of the
// same cramped area.
function layout(nodes, edges, w, h, useSaved) {
  // If every node already carries a saved x/y (from a previous "Save layout"),
  // reuse it as-is instead of re-simulating -- that's what makes a saved
  // arrangement the real default on reload rather than a one-time snapshot.
  if (useSaved && nodes.length > 0 && nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))) {
    const pos = {};
    nodes.forEach((node) => { pos[node.id] = { x: node.x, y: node.y }; });
    return pos;
  }

  const n = nodes.length;
  const charge = n > 60 ? -420 : n > 30 ? -340 : -260;
  const linkDistance = n > 60 ? 130 : n > 30 ? 110 : 95;

  const rank = computeRanks(nodes, edges);
  const maxRank = Math.max(0, ...rank.values());
  const margin = 130;
  const rankX = (id) => (maxRank === 0 ? w / 2 : margin + (rank.get(id) / maxRank) * (w - margin * 2));

  // Spread nodes within the same rank evenly down the column instead of all
  // targeting the vertical center -- otherwise a rank with many nodes (e.g. 6
  // lead-source nodes at rank 0) all get pulled to the same spot and only
  // collide() fights to separate them, which reads as a clump.
  const byRank = new Map();
  nodes.forEach((node) => {
    const r = rank.get(node.id);
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(node.id);
  });
  const rankY = new Map();
  byRank.forEach((ids) => {
    ids.forEach((id, i) => rankY.set(id, ((i + 1) / (ids.length + 1)) * h));
  });

  const simNodes = nodes.map((node) => ({ ...node, x: rankX(node.id), y: rankY.get(node.id) }));
  const simLinks = edges.map((e) => ({ ...e }));
  const sim = d3
    .forceSimulation(simNodes)
    .force('link', d3.forceLink(simLinks).id((d) => d.id).distance(linkDistance).strength(0.3))
    .force('charge', d3.forceManyBody().strength(charge))
    .force('x', d3.forceX((d) => rankX(d.id)).strength(0.7))
    .force('y', d3.forceY((d) => rankY.get(d.id)).strength(0.25))
    .force('collide', d3.forceCollide(n > 60 ? 26 : 38))
    .stop();
  for (let i = 0; i < 400; i++) sim.tick();
  const pos = {};
  simNodes.forEach((sn) => {
    pos[sn.id] = {
      x: Math.max(margin, Math.min(w - margin, sn.x)),
      y: Math.max(40, Math.min(h - 40, sn.y)),
    };
  });
  return pos;
}

function NodeShape({ shape, r, color, fill, dashed, strokeWidth = 2 }) {
  const props = { fill: fill ? color : 'none', stroke: color, strokeWidth, strokeDasharray: dashed ? '3,2' : 'none' };
  if (shape === 'circle') return <circle r={r} {...props} />;
  if (shape === 'diamond') {
    const p = `0,${-r} ${r},0 0,${r} ${-r},0`;
    return <polygon points={p} {...props} />;
  }
  const p = `0,${-r} ${r * 0.95},${r * 0.7} ${-r * 0.95},${r * 0.7}`;
  return <polygon points={p} {...props} />;
}

const GraphCanvas = forwardRef(function GraphCanvas({
  nodes,
  edges,
  feasibleEdgeKeys,
  nodeFeasibleFn,
  pathNodeSet,
  pathEdgeSet,
  startId,
  goalId,
  onSelectNode,
  typeFilter,
  searchText,
  relayoutToken,
  assetHighlightSet,
  // Both the single-asset "suggest a path" feature and the goal-first
  // "propose a new workflow" feature render through this same generalized
  // pair -- App.jsx merges whichever is active into these arrays, so a
  // single-node suggestion is just the n=1 case, not a separate code path.
  proposedNodes,
  proposedEdges,
}, ref) {
  const { colors: t } = useTheme();
  const [size, setSize] = useState({ w: MIN_W, h: MIN_H });
  const [positions, setPositions] = useState({});
  // Pan/zoom, n8n-style: k is scale, x/y is the translate applied to the
  // node/edge group -- independent of the viewBox, which always stays 0..size.w.
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const dragRef = useRef(null);
  const panRef = useRef(null); // { startClientX, startClientY, startViewX, startViewY } while panning the background
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const prevRelayoutToken = useRef(relayoutToken);

  // Frames every visible node with padding -- same job as n8n's "fit view"
  // button. Pulled out as its own function so both the initial layout and the
  // manual button can call it.
  const fitView = useCallback((pos, w, h) => {
    const pts = Object.values(pos);
    if (pts.length === 0) return;
    const pad = 60;
    const minX = Math.min(...pts.map((p) => p.x)) - pad;
    const maxX = Math.max(...pts.map((p) => p.x)) + pad;
    const minY = Math.min(...pts.map((p) => p.y)) - pad;
    const maxY = Math.max(...pts.map((p) => p.y)) + pad;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const k = Math.min(2, w / spanX, h / spanY);
    setView({ k, x: w / 2 - k * (minX + maxX) / 2, y: h / 2 - k * (minY + maxY) / 2 });
  }, []);

  // Lets a parent (the "Save layout" button) read exactly what's on screen right
  // now, drag adjustments included, without lifting position state up.
  useImperativeHandle(ref, () => ({
    getPositions: () => positions,
    fitView: () => fitView(positions, size.w, size.h),
  }), [positions, fitView, size.w, size.h]);

  // Track the actual rendered size of the canvas's parent -- this is what makes
  // the drag/layout space grow with the browser window instead of staying
  // pinned to a fixed pixel box.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(MIN_W, Math.round(width)), h: Math.max(MIN_H, Math.round(height)) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Re-layout whenever the graph's actual structure changes (a new nodes/edges
  // array reference from App.jsx after a fetch/CSV-import/JSON-edit), the
  // measured canvas size changes, or the user explicitly asks for a re-layout --
  // NOT on every selection/filter/search change.
  useEffect(() => {
    // Only an explicit Re-layout click (relayoutToken actually changing on this
    // run) should discard a saved arrangement -- a data reload or resize should
    // still respect whatever was saved.
    const explicitRelayout = prevRelayoutToken.current !== relayoutToken;
    prevRelayoutToken.current = relayoutToken;
    const pos = layout(nodes, edges, size.w, size.h, !explicitRelayout);
    setPositions(pos);
    // Saved x/y are absolute graph-space coordinates from whenever they were
    // last saved -- they can easily fall outside the *current* container size
    // (a narrower window, a sidebar panel open). Framing on every load/resize
    // is what keeps nodes from rendering off past the visible edge.
    fitView(pos, size.w, size.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, size.w, size.h, relayoutToken]);

  // Background pan -- starts only when the pointerdown didn't already land on a
  // node (node's own onPointerDown calls stopPropagation, so this only fires
  // for clicks on empty canvas).
  const onBackgroundPointerDown = useCallback((e) => {
    panRef.current = { startClientX: e.clientX, startClientY: e.clientY, startViewX: view.x, startViewY: view.y };
  }, [view.x, view.y]);

  // Wheel-to-zoom, keeping the point under the cursor fixed -- the same feel
  // as n8n/most node editors, rather than always zooming toward center.
  const onWheel = useCallback((e) => {
    e.preventDefault();
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * size.w;
    const py = ((e.clientY - rect.top) / rect.height) * size.h;
    setView((prev) => {
      const factor = Math.exp(-e.deltaY * 0.001);
      const k = Math.min(4, Math.max(0.15, prev.k * factor));
      return {
        k,
        x: px - ((px - prev.x) / prev.k) * k,
        y: py - ((py - prev.y) / prev.k) * k,
      };
    });
  }, [size.w, size.h]);

  const onPointerDown = useCallback((id, e) => {
    e.stopPropagation();
    dragRef.current = id;
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!svgRef.current) return;
    if (panRef.current) {
      const { startClientX, startClientY, startViewX, startViewY } = panRef.current;
      const rect = svgRef.current.getBoundingClientRect();
      setView((prev) => ({
        ...prev,
        x: startViewX + ((e.clientX - startClientX) / rect.width) * size.w,
        y: startViewY + ((e.clientY - startClientY) / rect.height) * size.h,
      }));
      return;
    }
    if (!dragRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    // Screen -> viewBox space, then invert the pan/zoom transform to get back
    // to graph space -- dragging a node has to account for the current zoom
    // level or it drifts relative to the cursor once k != 1.
    const vx = ((e.clientX - rect.left) / rect.width) * size.w;
    const vy = ((e.clientY - rect.top) / rect.height) * size.h;
    const x = (vx - view.x) / view.k;
    const y = (vy - view.y) / view.k;
    setPositions((prev) => ({ ...prev, [dragRef.current]: { x, y } }));
  }, [size.w, size.h, view.x, view.y, view.k]);

  const onPointerUp = useCallback(() => { dragRef.current = null; panRef.current = null; }, []);

  const searchMatch = useMemo(() => {
    const q = (searchText || '').trim().toLowerCase();
    if (!q) return null;
    return new Set(nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id));
  }, [nodes, searchText]);

  // Text search and asset-panel selection are two independent sources of the
  // same highlight/dim visual treatment. Only one is normally active at a time
  // (per the confirmed scope), so a plain fallback is enough rather than a merge.
  const highlightMatch = searchMatch || (assetHighlightSet && assetHighlightSet.size > 0 ? assetHighlightSet : null);

  const visible = useMemo(() => {
    if (!typeFilter || typeFilter.size === 0) return new Set(nodes.map((n) => n.id));
    return new Set(nodes.filter((n) => typeFilter.has(n.type)).map((n) => n.id));
  }, [nodes, typeFilter]);

  // Proposed nodes (asset-suggestion or goal-proposal, neither yet part of
  // `nodes`/`edges`) have no saved position. Single-node case: anchor at the
  // centroid of whatever real nodes its edges connect to, offset upward, same
  // as the original Phase 3 behavior. Multi-node case (goal-first proposal):
  // resolve in passes, since a proposed node may only connect to ANOTHER
  // proposed node rather than an existing real one -- each pass places
  // whichever remaining proposed nodes now have at least one already-placed
  // neighbor (real or proposed), until nothing more can be resolved. Any
  // proposed node left fully disconnected falls back to a stacked position
  // near canvas center rather than being silently dropped.
  //
  // Within a single pass, nodes that land on (nearly) the same raw anchor
  // point -- several siblings anchored to the same one real/proposed
  // neighbor -- are fanned out horizontally rather than left stacked on the
  // same x. Separately, a node anchored ONLY to other proposed nodes (no real
  // node in its neighbor set at all) gets a small deterministic horizontal
  // nudge, growing with how many hops it is from any real anchor -- without
  // this, a straight chain of proposed nodes (A anchors to a real node, B
  // anchors only to A, C only to B, ...) each resolve alone in their own pass
  // and the per-pass grouping above never sees more than one member, so they
  // still stack in a perfectly vertical "totem pole." Both problems were
  // confirmed against a real 5-node goal-proposal in the running app,
  // 2026-09-13 -- the totem-pole case is the one actually screenshotted.
  const proposedPositions = useMemo(() => {
    const list = proposedNodes || [];
    if (list.length === 0) return {};
    const resolved = {};
    const chainDepth = {}; // id -> hops from nearest real anchor, for the chain nudge below
    const getPos = (id) => positions[id] || resolved[id];
    // Simple deterministic hash so the same node always nudges the same way
    // across renders, rather than jittering.
    const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
    let remaining = list;
    for (let pass = 0; pass < list.length + 1 && remaining.length > 0; pass++) {
      const stillRemaining = [];
      const placedThisPass = []; // [{ n, cx, cy, depth }] -- grouped below before committing to `resolved`
      for (const n of remaining) {
        const neighborIds = (proposedEdges || [])
          .filter((e) => e.source === n.id || e.target === n.id)
          .map((e) => (e.source === n.id ? e.target : e.source));
        const neighborPositions = neighborIds.map(getPos).filter(Boolean);
        if (neighborPositions.length > 0) {
          const cx = neighborPositions.reduce((s, p) => s + p.x, 0) / neighborPositions.length;
          const cy = neighborPositions.reduce((s, p) => s + p.y, 0) / neighborPositions.length;
          const hasRealNeighbor = neighborIds.some((id) => positions[id]);
          const depth = hasRealNeighbor ? 1 : 1 + Math.max(...neighborIds.map((id) => chainDepth[id] || 0));
          placedThisPass.push({ n, cx, cy, depth });
        } else {
          stillRemaining.push(n);
        }
      }
      // Group by anchor point (rounded, so near-identical centroids collide
      // too) and spread each group's members evenly across a horizontal band
      // centered on that anchor -- a lone node in its group is unaffected by
      // this part (offset 0), reproducing the original single-node behavior.
      const groups = new Map();
      for (const p of placedThisPass) {
        const key = `${Math.round(p.cx / 40)}:${Math.round(p.cy / 40)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      }
      for (const group of groups.values()) {
        group.forEach(({ n, cx, cy, depth }, i) => {
          const siblingSpread = (i - (group.length - 1) / 2) * 70;
          // depth > 1 means every neighbor used to anchor this node is itself
          // proposed (chained, no real anchor in sight) -- nudge sideways,
          // growing with depth, alternating direction by a hash of the id so
          // a multi-hop chain fans out into a diagonal rather than a column.
          const chainNudge = depth > 1 ? (hash(n.id) % 2 === 0 ? 1 : -1) * 35 * (depth - 1) : 0;
          resolved[n.id] = { x: cx + siblingSpread + chainNudge, y: cy - 70 };
          chainDepth[n.id] = depth;
        });
      }
      if (stillRemaining.length === remaining.length) break; // no progress this pass -- stop early
      remaining = stillRemaining;
    }
    remaining.forEach((n, i) => {
      resolved[n.id] = { x: size.w / 2 + i * 60, y: size.h / 2 };
    });
    return resolved;
  }, [proposedNodes, proposedEdges, positions, size.w, size.h]);

  // fitView above only ever sees real `positions` and only re-runs on graph/
  // size/relayout changes -- a freshly-arrived proposal changes neither, so
  // without this, proposed nodes can render entirely outside the current
  // view with nothing to pan/zoom the user there, discoverable only by
  // manually scrolling around (confirmed against a real goal-proposal in the
  // running app, 2026-09-13). Re-frame using real + proposed positions
  // together whenever the set of proposed nodes actually changes -- not on
  // every render, since proposedNodes/proposedEdges are stable references
  // from App.jsx unless the underlying suggestion/proposal itself changed.
  useEffect(() => {
    if (!proposedNodes || proposedNodes.length === 0) return;
    fitView({ ...positions, ...proposedPositions }, size.w, size.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposedNodes, proposedEdges]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size.w} ${size.h}`}
        width="100%"
        height="100%"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        style={{ cursor: panRef.current ? 'grabbing' : dragRef.current ? 'grabbing' : 'grab', display: 'block' }}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={t.EDGE_IDLE} />
          </marker>
          <marker id="arrow-path" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={t.ACCENT} />
          </marker>
        </defs>

        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
        {edges.map((e, i) => {
          const a = positions[e.source], b = positions[e.target];
          if (!a || !b) return null;
          if (!visible.has(e.source) || !visible.has(e.target)) return null;
          const key = e.source + '>' + e.target;
          const onPath = pathEdgeSet.has(key);
          const infeasible = !feasibleEdgeKeys.has(key);
          return (
            <line
              key={i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={onPath ? t.ACCENT : infeasible ? t.WARN : t.EDGE_IDLE}
              strokeWidth={2.5}
              strokeDasharray={infeasible ? '4,3' : 'none'}
              opacity={onPath ? 1 : infeasible ? 0.45 : 0.6}
              markerEnd={onPath ? 'url(#arrow-path)' : 'url(#arrow)'}
            />
          );
        })}

        {nodes.map((n) => {
          const p = positions[n.id];
          if (!p || !visible.has(n.id)) return null;
          const shape = TYPE_SHAPE[n.type] || TYPE_SHAPE.tool;
          const color = t.TYPE_COLOR[n.type] || t.TYPE_COLOR.tool;
          const onPath = pathNodeSet.has(n.id);
          const isEndpoint = n.id === startId || n.id === goalId;
          const infeasible = !nodeFeasibleFn(n);
          const dimmed = highlightMatch && !highlightMatch.has(n.id);
          return (
            <g
              key={n.id}
              transform={`translate(${p.x},${p.y})`}
              onPointerDown={(e) => onPointerDown(n.id, e)}
              onClick={() => onSelectNode(n.id)}
              style={{ cursor: 'grab', opacity: dimmed ? 0.25 : 1 }}
            >
              <rect x={-24} y={-16} width={48} height={50} fill="transparent" />
              {n.id === goalId && (
                <circle r={18} fill="none" stroke={t.GOAL} strokeWidth={3} strokeDasharray="5,4" />
              )}
              {n.id === startId && (
                <circle r={17} fill="none" stroke={onPath ? t.ACCENT : t.TEXT} strokeOpacity={0.5} />
              )}
              {highlightMatch && highlightMatch.has(n.id) && (
                <circle r={19} fill="none" stroke={t.ACCENT} strokeOpacity={0.9} strokeWidth={1.5} />
              )}
              <NodeShape
                shape={shape} r={11}
                color={onPath ? t.ACCENT : infeasible ? t.WARN : color}
                fill={onPath}
                dashed={infeasible}
                strokeWidth={2}
              />
              {n.phase && (
                <text y={-16} textAnchor="middle" fontSize={7} fill={t.MUTED} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {n.phase}
                </text>
              )}
              <text y={26} textAnchor="middle" fontSize={9.5} fill={onPath ? t.TEXT : t.MUTED}>
                {n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label}
              </text>
            </g>
          );
        })}

        {(proposedEdges || []).map((e, i) => {
          const a = positions[e.source] || proposedPositions[e.source];
          const b = positions[e.target] || proposedPositions[e.target];
          if (!a || !b) return null;
          return (
            <line
              key={`proposed-edge-${i}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={t.ACCENT_ALT}
              strokeWidth={2.5}
              strokeDasharray="6,4"
              opacity={0.8}
            />
          );
        })}

        {(proposedNodes || []).map((n) => {
          const p = proposedPositions[n.id];
          if (!p) return null;
          return (
            <g key={`proposed-node-${n.id}`} transform={`translate(${p.x},${p.y})`} style={{ opacity: 0.9 }}>
              <title>{n.assumes?.join(' ') || 'Proposed node -- not yet part of this workflow.'}</title>
              <NodeShape
                shape={TYPE_SHAPE[n.type] || TYPE_SHAPE.tool}
                r={11}
                color={t.ACCENT_ALT}
                fill={false}
                dashed
              />
              <text y={26} textAnchor="middle" fontSize={9.5} fill={t.ACCENT_ALT}>
                {(n.label || '').length > 22 ? n.label.slice(0, 21) + '…' : n.label}
              </text>
              <text y={-16} textAnchor="middle" fontSize={8} fill={t.ACCENT_ALT} fontStyle="italic">
                proposed
              </text>
            </g>
          );
        })}
        </g>
      </svg>

      <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={() => fitView(positions, size.w, size.h)}
          title="Fit view -- frame every node currently in the graph"
          style={{ width: 30, height: 30, borderRadius: 4, background: t.PANEL, border: `1px solid ${t.BORDER}`, color: t.TEXT, cursor: 'pointer', fontSize: 14, lineHeight: '1' }}
        >
          ⤢
        </button>
        <button
          onClick={() => setView((prev) => ({ ...prev, k: Math.min(4, prev.k * 1.3) }))}
          title="Zoom in"
          style={{ width: 30, height: 30, borderRadius: 4, background: t.PANEL, border: `1px solid ${t.BORDER}`, color: t.TEXT, cursor: 'pointer', fontSize: 16, lineHeight: '1' }}
        >
          +
        </button>
        <button
          onClick={() => setView((prev) => ({ ...prev, k: Math.max(0.15, prev.k / 1.3) }))}
          title="Zoom out"
          style={{ width: 30, height: 30, borderRadius: 4, background: t.PANEL, border: `1px solid ${t.BORDER}`, color: t.TEXT, cursor: 'pointer', fontSize: 16, lineHeight: '1' }}
        >
          −
        </button>
      </div>
    </div>
  );
});

export default GraphCanvas;
