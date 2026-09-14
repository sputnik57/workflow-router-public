import { useMemo, useState } from 'react';
import { useTheme } from '../theme.jsx';

const CATEGORY_LABEL = {
  'claude-skill': 'Claude skills',
  'plugin-skill': 'Plugin skills',
  'dashboard-feature': 'Dashboard features',
  'script': 'Scripts',
  'n8n-webhook': 'n8n webhooks',
  'external-service': 'External services',
  'scraper': 'Scrapers',
  'llm-access': 'LLM access',
  'social-platform': 'Social platforms',
  'research-source': 'Research sources',
  'creative-suite': 'Creative suites (desktop)',
};

// Informational browsing + highlight-in-graph only, per confirmed scope --
// no "add as node" affordance anywhere in this component.
export default function AssetPanel({ resources, selectedAssetId, onSelectAsset, linkedNodeLabels }) {
  const { colors: t } = useTheme();
  const [q, setQ] = useState('');

  const grouped = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = term
      ? resources.filter((r) =>
          r.name.toLowerCase().includes(term) ||
          r.category.toLowerCase().includes(term) ||
          (r.vendor || '').toLowerCase().includes(term)
        )
      : resources;
    const groups = {};
    for (const r of filtered) {
      (groups[r.category] ||= []).push(r);
    }
    for (const k in groups) groups[k].sort((a, b) => a.name.localeCompare(b.name));
    return groups;
  }, [resources, q]);

  const selected = resources.find((r) => r.id === selectedAssetId) || null;

  return (
    <div className="rounded p-3" style={{ background: t.PANEL, border: `1px solid ${t.BORDER}` }}>
      <div className="text-xs mb-2" style={{ color: t.MUTED }}>
        Asset registry — {resources.length} resources. Select one to see its detail and, if it's used in
        the current workflow, highlight it on the canvas.
      </div>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, category, or vendor…"
          className="w-full text-sm px-2 py-1.5 rounded"
          style={{ background: 'transparent', border: `1px solid ${t.BORDER}`, color: t.TEXT, flex: '1 1 auto' }}
        />
        {q && (
          <button
            onClick={() => setQ('')}
            className="text-xs px-2 py-1.5 rounded"
            style={{ background: 'transparent', border: `1px solid ${t.BORDER}`, color: t.MUTED, cursor: 'pointer', flex: '0 0 auto' }}
          >
            Clear
          </button>
        )}
      </div>

      <div
        className="mb-3"
        style={{
          maxHeight: 600,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '0.75rem',
        }}
      >
        {Object.keys(grouped).sort().map((cat) => (
          <div key={cat} className="p-2 rounded" style={{ border: `1px solid ${t.BORDER}` }}>
            <div className="text-xs mb-1" style={{ color: t.MUTED }}>{CATEGORY_LABEL[cat] || cat}</div>
            <div className="flex flex-col gap-0.5">
              {grouped[cat].map((r) => (
                <button
                  key={r.id}
                  onClick={() => onSelectAsset(r.id === selectedAssetId ? null : r.id)}
                  className="text-left text-sm px-2 py-1 rounded"
                  style={{
                    background: r.id === selectedAssetId ? t.ACCENT : 'transparent',
                    color: r.id === selectedAssetId ? t.ON_ACCENT : t.TEXT,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        {Object.keys(grouped).length === 0 && (
          <div className="text-sm" style={{ color: t.MUTED }}>No resources match.</div>
        )}
      </div>

      <div className="rounded p-3 text-sm" style={{ background: 'transparent', border: `1px solid ${t.BORDER}`, minHeight: 120 }}>
        {selected ? (
          <div>
            <div className="font-medium mb-1">{selected.name}</div>
            <div className="text-xs mb-2" style={{ color: t.MUTED }}>
              {CATEGORY_LABEL[selected.category] || selected.category} · {selected.vendor}
            </div>
            {selected.description && <div className="text-sm mb-2">{selected.description}</div>}
            {selected.path && (
              <div className="text-xs mb-2" style={{ color: t.MUTED, wordBreak: 'break-all' }}>{selected.path}</div>
            )}
            {selected.notes && <div className="text-xs mb-2" style={{ color: t.MUTED }}>{selected.notes}</div>}
            <div className="text-xs mt-2" style={{ color: t.MUTED }}>
              {linkedNodeLabels.length > 0
                ? `Used by: ${linkedNodeLabels.join(', ')}`
                : 'Not yet used by any node in the current workflow.'}
            </div>
          </div>
        ) : (
          <div style={{ color: t.MUTED }}>Select a resource to see its detail.</div>
        )}
      </div>
    </div>
  );
}
