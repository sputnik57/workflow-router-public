import { useTheme } from '../theme.jsx';

function humanize(key) {
  return key.replace(/_/g, ' ');
}

function stepsFor(pathObj, byId, edges) {
  if (!pathObj) return [];
  const steps = [];
  for (let i = 0; i < pathObj.path.length; i++) {
    const node = byId[pathObj.path[i]];
    const inboundEdge = i > 0
      ? edges.find((e) => e.source === pathObj.path[i - 1] && e.target === pathObj.path[i])
      : null;
    steps.push({
      node,
      weight: inboundEdge ? (inboundEdge.weight ?? 1) : null,
      assumes: [...(inboundEdge?.assumes || []), ...(node.assumes || [])],
      requires: [...(inboundEdge?.requires || []), ...(node.requires || [])],
    });
  }
  return steps;
}

// One ranked candidate path (one of Yen's k results). `rank` is 0-indexed
// (0 = lowest cost); `label` is the human-facing ordinal ("Lowest-cost path",
// "Alternative 2", etc.) so this same component covers all k results, not
// just a fixed best/alt pair.
export default function PathCard({ label, data, isChosen, accent, byId, edges, met, onChoose }) {
  const { colors: t } = useTheme();
  if (!data) return null;
  const steps = stepsFor(data, byId, edges);
  return (
    <div className="rounded p-3 text-sm mb-3" style={{ background: t.PANEL, border: `1px solid ${isChosen ? accent : t.BORDER}` }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <span style={{ color: accent }}>{label}</span>{' '}
          <span style={{ color: t.MUTED }}>— total cost {data.cost.toFixed(2)}</span>
        </div>
        {!isChosen && (
          <button
            onClick={onChoose}
            className="text-xs px-2 py-1 rounded"
            style={{ background: 'transparent', border: `1px solid ${t.BORDER}`, color: t.TEXT, cursor: 'pointer' }}
          >
            Use this path
          </button>
        )}
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="text-sm">
            <span>{i > 0 ? '→ ' : ''}{s.node.label}</span>
            {s.weight != null && <span style={{ color: t.MUTED }}> ({s.weight})</span>}
            {(s.assumes.length > 0 || s.requires.length > 0) && (
              <ul className="ml-4 mt-0.5">
                {s.requires.map((r, j) => (
                  <li key={'r' + j} className="text-xs" style={{ color: met.has(r) ? t.MUTED : t.WARN }}>
                    requires: {humanize(r)}{!met.has(r) ? ' (not currently met)' : ''}
                  </li>
                ))}
                {s.assumes.map((a, j) => (
                  <li key={'a' + j} className="text-xs" style={{ color: t.MUTED }}>assumes: {a}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
