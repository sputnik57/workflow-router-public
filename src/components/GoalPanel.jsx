import { useTheme } from '../theme.jsx';

// Goal-first ranked list: pick a goal, see every node that can reach it and its
// total cost, then click a row to drill into the k-shortest-paths from that node.
export default function GoalPanel({ ranked, selectedStartId, onPickStart }) {
  const { colors: t } = useTheme();
  if (!ranked) return null;
  return (
    <div className="rounded p-3 text-sm" style={{ background: t.PANEL, border: `1px solid ${t.BORDER}`, maxHeight: 260, overflowY: 'auto' }}>
      <div className="mb-2" style={{ color: t.MUTED }}>
        {ranked.length} node{ranked.length === 1 ? '' : 's'}/asset{ranked.length === 1 ? '' : 's'} can reach this goal — click one to see its routes
      </div>
      {ranked.length === 0 ? (
        <div style={{ color: t.MUTED }}>No node/asset in this graph can currently reach the selected goal.</div>
      ) : (
        <ol className="space-y-1.5">
          {ranked.map((r) => {
            const isSelected = r.id === selectedStartId;
            return (
              <li key={r.id}>
                <button
                  onClick={() => onPickStart(r.id)}
                  className="w-full text-sm px-2 py-1.5 rounded flex items-center justify-between"
                  style={{
                    background: isSelected ? `${t.ACCENT}1F` : 'transparent',
                    border: `1px solid ${isSelected ? t.ACCENT : t.BORDER}`,
                    color: t.TEXT,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>{r.label}</span>
                  <span style={{ color: t.MUTED }}>{r.cost.toFixed(2)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
