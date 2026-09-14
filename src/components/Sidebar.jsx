import { useState, useEffect } from 'react';
import { useTheme, TYPE_SHAPE, TYPE_LABEL } from '../theme.jsx';

const CATEGORY_LABEL = {
  'claude-skill': 'Claude skill', 'plugin-skill': 'Plugin skill', 'dashboard-feature': 'Dashboard feature',
  'script': 'Script', 'n8n-webhook': 'n8n webhook', 'external-service': 'External service',
  'scraper': 'Scraper', 'llm-access': 'LLM access', 'social-platform': 'Social platform', 'research-source': 'Research source',
};

// Only render a path as a real clickable link when it's actually resolvable in a
// browser -- a bare domain ("midjourney.com") or a full URL. Filesystem paths
// (~/.claude/skills/...), env var names (N8N_COPY_WEBHOOK_URL), and relative API
// routes with no known host all stay as plain reference text instead of a dead link.
function linkableHref(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\.[a-z]{2,}$/i.test(path) && !path.includes('/')) return `https://${path}`;
  return null;
}

function NodeShapeIcon({ shape, color }) {
  const r = 6;
  const props = { fill: 'none', stroke: color, strokeWidth: 2 };
  if (shape === 'circle') return <circle r={r} {...props} />;
  if (shape === 'diamond') return <polygon points={`0,${-r} ${r},0 0,${r} ${-r},0`} {...props} />;
  return <polygon points={`0,${-r} ${r * 0.95},${r * 0.7} ${-r * 0.95},${r * 0.7}`} {...props} />;
}

function humanize(key) {
  return key.replace(/_/g, ' ');
}

export default function Sidebar({
  byId, selectedId,
  allConditions, met, onToggleCondition,
  typeFilter, onToggleType,
  searchText, onSearchChange,
  resourcesById,
}) {
  const { colors: t } = useTheme();
  const selected = selectedId ? byId[selectedId] : null;
  const resource = selected?.resourceId ? resourcesById?.[selected.resourceId] : null;
  const resourceHref = resource ? linkableHref(resource.path) : null;
  const [openStatus, setOpenStatus] = useState('');
  useEffect(() => { setOpenStatus(''); }, [selectedId]);

  async function handleOpenInEditor(filePath) {
    setOpenStatus('Opening…');
    try {
      const res = await fetch('/api/open', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to open');
      setOpenStatus('Opened in editor.');
    } catch (err) {
      setOpenStatus('Could not open: ' + err.message);
    }
  }

  return (
    <div style={{ width: 280, flex: '0 0 auto' }}>
      <div className="text-xs mb-2" style={{ color: t.MUTED }}>Node types — click to filter</div>
      <div className="flex flex-col gap-1.5 mb-4">
        {Object.keys(TYPE_LABEL).map((k) => {
          const active = typeFilter.size === 0 || typeFilter.has(k);
          return (
            <button
              key={k}
              onClick={() => onToggleType(k)}
              className="flex items-center gap-2 text-sm"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', opacity: active ? 1 : 0.4, color: t.TEXT }}
            >
              <svg width="16" height="16"><g transform="translate(8,8)"><NodeShapeIcon shape={TYPE_SHAPE[k]} color={t.TYPE_COLOR[k]} /></g></svg>
              {TYPE_LABEL[k]}
            </button>
          );
        })}
      </div>

      <div className="mb-4">
        <div className="text-xs mb-2" style={{ color: t.MUTED }}>Search / highlight by label</div>
        <input
          type="text"
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Type to highlight matching nodes…"
          className="w-full text-sm px-2 py-1.5 rounded"
          style={{ background: t.PANEL, border: `1px solid ${t.BORDER}`, color: t.TEXT }}
        />
      </div>

      {allConditions.length > 0 && (
        <div className="mb-4">
          <div className="text-xs mb-2" style={{ color: t.MUTED }}>
            Dependencies — uncheck what isn't currently true
          </div>
          <div className="flex flex-col gap-1">
            {allConditions.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={met.has(c)} onChange={() => onToggleCondition(c)} />
                <span style={{ color: met.has(c) ? t.TEXT : t.WARN }}>{humanize(c)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div
        className="rounded p-3 text-sm"
        style={{ background: t.PANEL, border: `1px solid ${t.BORDER}`, minHeight: 140 }}
      >
        {selected ? (
          <div>
            <div className="font-medium mb-1">{selected.label}</div>
            <div className="text-xs mb-2" style={{ color: t.MUTED }}>{TYPE_LABEL[selected.type]}</div>
            <div className="text-xs mb-1" style={{ color: t.MUTED }}>Input from</div>
            <div className="text-sm mb-2">
              {selected.inputs?.length ? selected.inputs.map((id) => byId[id]?.label || id).join(', ') : '—'}
            </div>
            <div className="text-xs mb-1" style={{ color: t.MUTED }}>Output to</div>
            <div className="text-sm mb-2">
              {selected.outputs?.length ? selected.outputs.map((id) => byId[id]?.label || id).join(', ') : '—'}
            </div>
            {selected.requires?.length > 0 && (
              <>
                <div className="text-xs mb-1" style={{ color: t.MUTED }}>Requires</div>
                <div className="text-sm mb-2">{selected.requires.map(humanize).join(', ')}</div>
              </>
            )}
            {selected.assumes?.length > 0 && (
              <>
                <div className="text-xs mb-1" style={{ color: t.MUTED }}>Assumes</div>
                <div className="text-sm mb-2">{selected.assumes.join('; ')}</div>
              </>
            )}
            {resource && (
              <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${t.BORDER}` }}>
                <div className="text-xs mb-1" style={{ color: t.MUTED }}>
                  Resource — {CATEGORY_LABEL[resource.category] || resource.category}
                  {resource.vendor && resource.vendor !== 'unknown' ? ` · ${resource.vendor}` : ''}
                </div>
                {resource.description && <div className="text-sm mb-1">{resource.description}</div>}
                {resource.path && resourceHref && (
                  <a
                    href={resourceHref} target="_blank" rel="noreferrer"
                    className="text-sm break-all"
                    style={{ color: t.ACCENT }}
                  >
                    {resource.path} ↗
                  </a>
                )}
                {resource.path && !resourceHref && resource.path.startsWith('~/') && (
                  <button
                    onClick={() => handleOpenInEditor(resource.path)}
                    className="text-xs text-left break-all"
                    style={{ background: 'none', border: 'none', padding: 0, color: t.ACCENT, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {resource.path} — open in editor
                  </button>
                )}
                {resource.path && !resourceHref && !resource.path.startsWith('~/') && (
                  <code className="text-xs" style={{ color: t.MUTED, wordBreak: 'break-all' }}>{resource.path}</code>
                )}
                {openStatus && <div className="text-xs mt-1" style={{ color: t.MUTED }}>{openStatus}</div>}
                {resource.notes && <div className="text-xs mt-1" style={{ color: t.MUTED }}>{resource.notes}</div>}
              </div>
            )}
            {selected.resourceId && !resource && (
              <div className="text-xs mt-2" style={{ color: t.WARN }}>
                resourceId "{selected.resourceId}" not found in the asset registry.
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: t.MUTED }}>Click a node to see its inputs, outputs, and dependencies.</div>
        )}
      </div>

      <p className="text-xs mt-4" style={{ color: t.MUTED }}>
        Drag nodes to rearrange. Dashed red items depend on something you've marked as not
        currently true, and are excluded from goal ranking and path candidates.
      </p>
    </div>
  );
}
