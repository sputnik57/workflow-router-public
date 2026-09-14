import { useEffect, useState } from 'react';
import AssetPanel from './AssetPanel.jsx';

// brand-red/pink family stays constant across light and dark per globals.css --
// only background/foreground actually flip. Card surface/border/muted values
// below are this page's own derived choices for a readable dark card, not
// literal style-guide tokens (the guide doesn't define a dark card treatment).
const PALETTE = {
  light: { bg: '#FFFFFF', fg: '#1A1A1A', cardBg: '#FFFFFF', cardBorder: '#EEC7C7', muted: '#6b6b6b', wordmarkPanel: '#fafafa' },
  dark: { bg: '#0a0a0a', fg: '#ededed', cardBg: '#161414', cardBorder: '#5a3d3d', muted: '#a89a9a', wordmarkPanel: '#1a1616' },
};
const RED = '#DF2521'; // --brand-red, same in both themes
const DARK_RED = '#800000'; // --brand-dark-red, same in both themes

async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json();
}

function Section({ title, children, accent, c }) {
  return (
    <div
      className="mb-6 rounded-xl p-4"
      style={{ background: c.cardBg, border: `1px solid ${c.cardBorder}`, boxShadow: '0 1px 3px rgba(0,0,0,0.15)', borderTop: accent ? `4px solid ${RED}` : undefined }}
    >
      <div className="text-xs uppercase tracking-wide mb-3" style={{ color: c.muted, letterSpacing: '0.05em' }}>{title}</div>
      {children}
    </div>
  );
}

// Deliberately NOT the app's own workflow-router dark-mode theme.jsx tokens --
// this page renders data/brand.json's own palette, separate from the app's
// own theme. Its own light/dark toggle below is this page's, independent of
// the rest of the app.
export default function AdminPage({
  resources, selectedAssetId, onSelectAsset, linkedNodeLabels,
  graphFile, graphFiles, graphFileLabel, onSwitchGraph, onCsvFiles, onExportCsv, csvStatus,
  graph, jsonText, onJsonTextChange, jsonError, onApplyJson, onDeleteSuggested,
  explorationGraphs, onDeleteExplorationGraph,
}) {
  const [brand, setBrand] = useState(null);
  const [error, setError] = useState('');
  const [openStatus, setOpenStatus] = useState('');
  const [brandCopyStatus, setBrandCopyStatus] = useState('');
  const [mode, setMode] = useState('light'); // 'light' | 'dark'
  const [tab, setTab] = useState('brand'); // 'brand' | 'assets'

  useEffect(() => {
    apiGet('/api/brand').then(setBrand).catch((err) => setError(err.message));
  }, []);

  function handleCopyBrandInstruction() {
    if (!brand) return;
    const text = `Update the Brand tab in Workflow Router: edit data/brand.json to change what's shown here. This is example data -- replace it with your own brand's name, voice, and positioning.`;
    navigator.clipboard?.writeText(text).then(() => {
      setBrandCopyStatus('copied');
      setTimeout(() => setBrandCopyStatus((cur) => (cur === 'copied' ? '' : cur)), 1500);
    });
  }

  async function handleOpenSource(filePath) {
    if (!filePath) return;
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

  const c = PALETTE[mode];

  function TabButton({ id, label }) {
    const activeTab = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        className="text-sm px-3 py-1.5 rounded"
        style={{ background: activeTab ? RED : 'transparent', color: activeTab ? '#FFFFFF' : c.fg, border: `1px solid ${c.cardBorder}`, cursor: 'pointer' }}
      >
        {label}
      </button>
    );
  }

  return (
    <div style={{ background: c.bg, color: c.fg, minHeight: '100%', borderRadius: 8 }} className="p-6">
      <div className="flex gap-2 mb-6">
        <TabButton id="brand" label="Brand" />
        <TabButton id="assets" label="Asset management" />
        <TabButton id="workflow" label="Workflow management" />
        <TabButton id="suggestions" label="Explorations" />
      </div>

      {tab === 'suggestions' && (
        <SuggestionsMgtTab
          graph={graph}
          graphFileLabel={graphFileLabel}
          graphFile={graphFile}
          onDeleteSuggested={onDeleteSuggested}
          explorationGraphs={explorationGraphs}
          onDeleteExplorationGraph={onDeleteExplorationGraph}
          onSwitchGraph={onSwitchGraph}
          c={c}
        />
      )}

      {tab === 'assets' && (
        <AssetMgtTab
          resources={resources}
          selectedAssetId={selectedAssetId}
          onSelectAsset={onSelectAsset}
          linkedNodeLabels={linkedNodeLabels}
          graphFiles={graphFiles}
          graphFileLabel={graphFileLabel}
          explorationGraphs={explorationGraphs}
          c={c}
        />
      )}

      {tab === 'workflow' && (
        <WorkflowMgtTab
          graphFile={graphFile}
          graphFiles={graphFiles}
          graphFileLabel={graphFileLabel}
          onSwitchGraph={onSwitchGraph}
          onCsvFiles={onCsvFiles}
          onExportCsv={onExportCsv}
          csvStatus={csvStatus}
          graph={graph}
          jsonText={jsonText}
          onJsonTextChange={onJsonTextChange}
          jsonError={jsonError}
          onApplyJson={onApplyJson}
          c={c}
        />
      )}

      {tab === 'brand' && error && <div style={{ color: '#8a8a8a' }}>Failed to load brand.json: {error}</div>}
      {tab === 'brand' && !error && !brand && <div style={{ color: '#8a8a8a' }}>Loading…</div>}
      {tab === 'brand' && !error && brand && (
      <>
      <div className="flex items-start justify-between mb-1">
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>
          {brand.name.written}
        </div>
        <div className="text-right flex flex-col items-end gap-1">
          <div className="text-xs" style={{ color: c.muted }}>Preview this page in:</div>
          <div className="flex gap-1 mb-1">
            <button
              onClick={() => setMode('light')}
              className="text-xs px-2 py-1 rounded"
              style={{ background: mode === 'light' ? RED : 'transparent', color: mode === 'light' ? '#FFFFFF' : c.fg, border: `1px solid ${c.cardBorder}`, cursor: 'pointer' }}
            >
              Light
            </button>
            <button
              onClick={() => setMode('dark')}
              className="text-xs px-2 py-1 rounded"
              style={{ background: mode === 'dark' ? RED : 'transparent', color: mode === 'dark' ? '#FFFFFF' : c.fg, border: `1px solid ${c.cardBorder}`, cursor: 'pointer' }}
            >
              Dark
            </button>
          </div>
          {brand.sourcePath && (
            <button
              onClick={() => handleOpenSource(brand.sourcePath)}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'transparent', border: `1px solid ${c.cardBorder}`, color: DARK_RED, cursor: 'pointer' }}
            >
              Open source style guide
            </button>
          )}
          {brand.cssSourcePath && (
            <button
              onClick={() => handleOpenSource(brand.cssSourcePath)}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'transparent', border: `1px solid ${c.cardBorder}`, color: DARK_RED, cursor: 'pointer' }}
            >
              Open globals.css
            </button>
          )}
          {openStatus && <div className="text-xs mt-1" style={{ color: c.muted }}>{openStatus}</div>}
        </div>
      </div>
      <div className="text-xs mb-3" style={{ color: c.muted }}>{brand.status}</div>

      <div className="mb-6 p-3 rounded" style={{ background: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: c.muted, letterSpacing: '0.05em' }}>
          This page is read-only — edit it with an agent
        </div>
        <div className="text-sm mb-2">
          Nothing here is editable by clicking. To change the wording, colors, or tone shown on
          this page, paste this into a Claude Code (or similar) session:
        </div>
        <div className="flex items-start gap-2">
          <code
            className="text-xs p-2 rounded"
            style={{ background: c.wordmarkPanel || c.bg, border: `1px solid ${c.cardBorder}`, color: c.fg, flex: '1 1 auto', whiteSpace: 'pre-wrap' }}
          >
            Update the Brand tab in Workflow Router: edit <code>data/brand.json</code> to change
            what's shown here. This is example data — replace it with your own brand's name,
            voice, and positioning.
          </code>
          <button
            onClick={handleCopyBrandInstruction}
            className="text-xs px-2 py-1 rounded font-medium"
            style={{ background: RED, color: '#FFFFFF', cursor: 'pointer', flex: '0 0 auto' }}
          >
            {brandCopyStatus === 'copied' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <Section title="Brand name" c={c}>
        <div className="text-sm mb-1"><strong>Written:</strong> {brand.name.written}</div>
        <div className="text-xs mb-2" style={{ color: c.muted }}>{brand.name.writtenNote}</div>
        <div className="text-sm mb-1"><strong>Internal shorthand:</strong> {brand.name.internalShorthand}</div>
        <div className="text-xs" style={{ color: c.muted }}>{brand.name.internalShorthandNote}</div>
      </Section>

      <Section title="Anchor line" c={c}>
        <div className="text-lg" style={{ fontStyle: 'italic' }}>"{brand.anchorLine}"</div>
      </Section>

      <Section title="Voice & tone" c={c}>
        <div className="text-sm mb-3">{brand.voice.register}</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide mb-1" style={{ color: c.muted }}>Sounds like</div>
            <ul className="text-sm" style={{ paddingLeft: 16 }}>
              {brand.voice.soundsLike.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide mb-1" style={{ color: c.muted }}>Never sounds like</div>
            <ul className="text-sm" style={{ paddingLeft: 16, color: DARK_RED }}>
              {brand.voice.neverSoundsLike.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Positioning" c={c}>
        <div className="text-sm mb-2" style={{ fontWeight: 600 }}>{brand.positioning.oneLiner}</div>
        <div className="text-sm mb-2">{brand.positioning.commodityTrap}</div>
        <div className="text-sm mb-2">{brand.positioning.moat}</div>
        <div className="text-sm">{brand.positioning.codeSwitching}</div>
      </Section>

      </>
      )}
    </div>
  );
}

// Asset registry, moved here from the main workflow view 2026-09-11 --
// assets are infrastructure/config, not a workflow-canvas concern.
function AssetMgtTab({ resources, selectedAssetId, onSelectAsset, linkedNodeLabels, graphFiles, graphFileLabel, explorationGraphs, c }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm" style={{ color: c.muted }}>
          {resources.length} registered asset{resources.length === 1 ? '' : 's'} — Claude skills, dashboard
          features, n8n webhooks, external services, and more.
        </div>
        <div className="flex gap-2">
          <button
            disabled
            title="Coming soon"
            className="text-xs px-2 py-1 rounded"
            style={{ background: 'transparent', border: `1px solid ${c.cardBorder}`, color: c.muted, cursor: 'not-allowed' }}
          >
            + Add asset (coming soon)
          </button>
          <button
            disabled
            title="Coming soon"
            className="text-xs px-2 py-1 rounded"
            style={{ background: 'transparent', border: `1px solid ${c.cardBorder}`, color: c.muted, cursor: 'not-allowed' }}
          >
            Delete asset (coming soon)
          </button>
        </div>
      </div>
      <PortfolioScanSection
        resources={resources}
        graphFiles={graphFiles}
        graphFileLabel={graphFileLabel}
        explorationGraphs={explorationGraphs}
        c={c}
      />
      <AssetPanel
        resources={resources}
        selectedAssetId={selectedAssetId}
        onSelectAsset={onSelectAsset}
        linkedNodeLabels={linkedNodeLabels}
      />
    </div>
  );
}

// Portfolio scan -- no LLM call, just src/lib/portfolio-scan.js's plain
// compatibility-based report. Deliberately not in the Quick-start "Ask a
// business question" dropdown: unlike every option there, this needs no
// question or asset picked first and isn't scoped to one graph -- it's an
// unprompted, whole-registry audit, so it lives here as its own report
// instead. The framing: this isn't about spotting new blind spots to chase,
// it's about maximizing what's already in inventory before looking for
// anything new.
function PortfolioScanSection({ resources, graphFiles, graphFileLabel, explorationGraphs, c }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'done' | 'error'
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { unreferenced, deadEnd } | null

  async function runScan() {
    setStatus('loading');
    setError('');
    try {
      const explorationFiles = new Set((explorationGraphs || []).map((g) => g.file));
      const realFiles = (graphFiles || []).filter((f) => !explorationFiles.has(f));
      const graphsByFile = {};
      for (const file of realFiles) {
        const res = await fetch(`/api/graph?file=${encodeURIComponent(file)}`);
        if (!res.ok) throw new Error(`${file} failed: ${res.status}`);
        graphsByFile[file] = await res.json();
      }
      const { scanIdleAssets } = await import('../lib/portfolio-scan.js');
      setResult(scanIdleAssets(resources, graphsByFile));
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  return (
    <div className="rounded p-3 mb-4" style={{ border: `1px solid ${c.cardBorder}` }}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="text-sm font-medium">Maximize current inventory</div>
        <button
          onClick={runScan}
          disabled={status === 'loading'}
          className="text-xs px-2 py-1 rounded font-medium"
          style={{ background: RED, color: '#FFFFFF', cursor: 'pointer' }}
        >
          {status === 'loading' ? 'Scanning…' : 'Scan for idle assets'}
        </button>
      </div>
      <div className="text-xs mb-2" style={{ color: c.muted }}>
        Not a search for new opportunities — a report on what's already owned and not yet used
        anywhere across every real workflow, so existing inventory gets used fully before anything
        new gets added.
      </div>
      <div className="text-xs mb-2" style={{ color: c.muted, fontStyle: 'italic' }}>
        Accuracy depends on every real usage being linked via a node's <code>resourceId</code> —
        this only checks that field, not any SOP/skill layer a step might otherwise reference.
        Backfilling that link across every existing node is real, manual labor -- the example
        graph shipped with this app has it done, but a graph you build yourself will need the
        same pass. Treat "never used" results as an upper bound, not a confirmed fact, until
        that backfill happens.
      </div>
      {status === 'error' && <div className="text-xs" style={{ color: '#c0392b' }}>{error}</div>}
      {status === 'done' && result && (
        <div className="text-sm">
          <div className="mb-3">
            <div className="text-xs uppercase tracking-wide mb-1" style={{ color: c.muted }}>
              Never used ({result.unreferenced.length})
            </div>
            {result.unreferenced.length === 0 && (
              <div className="text-xs" style={{ color: c.muted }}>Every registered asset is linked to at least one workflow step.</div>
            )}
            {result.unreferenced.map((r) => (
              <div key={r.id} className="text-xs mb-1">
                <span className="font-medium">{r.name}</span>{' '}
                <span style={{ color: c.muted }}>({r.category}) — {r.description}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide mb-1" style={{ color: c.muted }}>
              Wired in, but a dead end ({result.deadEnd.length})
            </div>
            {result.deadEnd.length === 0 && (
              <div className="text-xs" style={{ color: c.muted }}>No linked asset's output goes unused elsewhere.</div>
            )}
            {result.deadEnd.map(({ resource, node, file }) => (
              <div key={node.id} className="text-xs mb-1">
                <span className="font-medium">{resource.name}</span>{' '}
                <span style={{ color: c.muted }}>
                  — used by "{node.label}" ({graphFileLabel ? graphFileLabel(file) : file}), but its output type has no compatible consumer anywhere
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// Lists every node in the currently-targeted graph that was added via the
// Phase 3 suggestion feature (App.jsx's handleAcceptSuggestion tags each with
// suggested/suggestedAt/suggestedRationale) so they can be pruned later --
// these are expected to accumulate as an experimental feature and not every
// accepted proposal will turn out useful once seen in place.
function SuggestionsMgtTab({
  graph, graphFileLabel, graphFile, onDeleteSuggested,
  explorationGraphs, onDeleteExplorationGraph, onSwitchGraph, c,
}) {
  const suggested = (graph?.nodes || []).filter((n) => n.suggested);
  // Rationale text can run long (a real one topped 200 words) -- collapsed by
  // default so the list stays scannable; per-card, not global, since you may
  // want one expanded while skimming the rest.
  const [expandedIds, setExpandedIds] = useState(new Set());
  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {/* Whole-file deletes for goal-first exploration graphs (Quick-start →
          "Propose a new workflow for a business goal...") -- distinct from the
          per-node list below, which prunes single accepted nodes inside
          whichever real graph is currently open. An exploration graph is its
          own self-contained file (real critical-path nodes + the LLM's new
          ones), so "delete" here means the whole file, not one node in it. */}
      <div className="text-sm mb-2 font-medium">Exploration workflows</div>
      <div className="text-sm mb-4" style={{ color: c.muted }}>
        Whole graphs created from a business-goal query (Quick-start → "Propose a new workflow...").
        Delete removes the entire file; it also shows up as its own entry in the Workflow dropdown
        until then.
      </div>
      {(!explorationGraphs || explorationGraphs.length === 0) && (
        <div className="text-sm mb-4" style={{ color: c.muted }}>None yet.</div>
      )}
      {(explorationGraphs || []).map(({ file, meta }) => (
        <div key={file} className="rounded p-3 mb-2" style={{ border: `1px dashed ${c.cardBorder}` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{meta?.query || file}</div>
              <div className="text-xs" style={{ color: c.muted, fontFamily: 'ui-monospace, monospace' }}>
                {file}{meta?.sourceGraphFile ? ` — from ${graphFileLabel ? graphFileLabel(meta.sourceGraphFile) : meta.sourceGraphFile}` : ''}
                {meta?.createdAt ? ` — created ${new Date(meta.createdAt).toLocaleDateString()}` : ''}
              </div>
            </div>
            <div className="flex gap-2 flex-none">
              <button
                onClick={() => onSwitchGraph?.(file)}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'transparent', border: `1px solid ${c.cardBorder}`, color: c.fg, cursor: 'pointer' }}
              >
                Open
              </button>
              <button
                onClick={() => onDeleteExplorationGraph?.(file)}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'transparent', border: `1px solid ${RED}`, color: RED, cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="mt-8 pt-6" style={{ borderTop: `1px solid ${c.cardBorder}` }}>
        <div className="text-sm mb-1 font-medium">Exploration nodes</div>
        <div className="text-xs mb-3 inline-block px-2 py-1 rounded" style={{ background: c.wordmarkPanel, border: `1px solid ${c.cardBorder}`, color: c.fg }}>
          Currently viewing: <strong>{graphFileLabel ? graphFileLabel(graphFile) : graphFile}</strong>
        </div>
        <div className="text-sm mb-4" style={{ color: c.muted }}>
          Same idea as Exploration workflows above, at node scale instead of whole-graph scale — a
          tentative single addition to an existing trusted workflow, not yet as trusted as the rest
          of it. A separate list, not nested under the row above: this always follows whichever
          workflow is open in the main canvas right now (switch graphs via the Workflow dropdown to
          see a different one's exploration nodes here). Added via the single-asset suggestion
          feature (Quick-start → "Suggest a path..."). Delete removes the node and its connecting
          edge(s) permanently.
        </div>
      </div>
      {suggested.length === 0 && (
        <div className="text-sm" style={{ color: c.muted }}>None yet in this workflow.</div>
      )}
      {suggested.map((n) => (
        <div key={n.id} className="rounded p-3 mb-2" style={{ border: `1px solid ${c.cardBorder}` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{n.label}</div>
              <div className="text-xs" style={{ color: c.muted, fontFamily: 'ui-monospace, monospace' }}>
                {n.id} — {n.type}{n.suggestedAt ? ` — accepted ${new Date(n.suggestedAt).toLocaleDateString()}` : ''}
              </div>
            </div>
            <div className="flex gap-2 flex-none">
              {n.suggestedRationale && (
                <button
                  onClick={() => toggleExpanded(n.id)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ background: 'transparent', border: `1px solid ${c.cardBorder}`, color: c.fg, cursor: 'pointer' }}
                >
                  {expandedIds.has(n.id) ? 'Close' : 'Open'}
                </button>
              )}
              <button
                onClick={() => onDeleteSuggested?.(n.id)}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'transparent', border: `1px solid ${RED}`, color: RED, cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
          {n.suggestedRationale && expandedIds.has(n.id) && (
            <div className="text-xs mt-2" style={{ color: c.muted }}>{n.suggestedRationale}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// Bulk CSV import/export, moved here from the main workflow toolbar
// 2026-09-11 -- same rationale as Asset mgt: this is workflow-data
// infrastructure, not a workflow-canvas concern. Always acts on whichever
// graph file is currently selected (same graphFile state the Workflow
// view uses), shown explicitly here since Admin doesn't otherwise make
// that context visible.
function WorkflowMgtTab({
  graphFile, graphFiles, graphFileLabel, onSwitchGraph, onCsvFiles, onExportCsv, csvStatus,
  graph, jsonText, onJsonTextChange, jsonError, onApplyJson, c,
}) {
  // Keep the raw-JSON editor's textarea in sync with whichever graph is
  // currently targeted -- re-stringifies whenever the underlying graph data
  // changes (a new file selected, a CSV import applied, etc.), so opening
  // this tab never shows stale content from a previous graph.
  useEffect(() => {
    if (graph) onJsonTextChange?.(JSON.stringify(graph, null, 2));
  }, [graph]);

  return (
    <div>
      <div className="text-sm mb-3" style={{ color: c.muted }}>
        Bulk-edit a workflow as spreadsheets instead of one node/edge at a time: export a graph to
        nodes.csv/edges.csv, edit in Excel/Sheets, then re-import — existing ids are updated in place,
        new ids are added.
      </div>

      <div className="text-xs uppercase tracking-wide mb-2" style={{ color: c.muted }}>
        Workflows — click one to target it below
      </div>
      <ul className="mb-4" style={{ listStyle: 'none', padding: 0 }}>
        {(graphFiles || []).map((f) => {
          const active = f === graphFile;
          return (
            <li key={f} className="mb-1.5">
              <button
                onClick={() => onSwitchGraph?.(f)}
                className="w-full text-left text-sm px-3 py-2 rounded flex items-center justify-between"
                style={{
                  background: active ? `${RED}1F` : 'transparent',
                  border: `1px solid ${active ? RED : c.cardBorder}`,
                  color: c.fg,
                  cursor: 'pointer',
                }}
              >
                <span>{graphFileLabel ? graphFileLabel(f) : f}</span>
                <span className="text-xs" style={{ color: c.muted, fontFamily: 'ui-monospace, monospace' }}>{f}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rounded p-3 text-sm mb-4" style={{ background: 'transparent', border: `1px solid ${c.cardBorder}` }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: c.muted }}>
          Currently targeting: {graphFileLabel ? graphFileLabel(graphFile) : graphFile}
        </div>
        <div className="mb-2" style={{ color: c.muted }}>
          Select a <code>nodes.csv</code> and/or <code>edges.csv</code> (schema in README.md — filename must
          contain "nodes" or "edges" so they're matched correctly).
        </div>
        <input type="file" accept=".csv" multiple onChange={onCsvFiles} className="text-sm mb-2" />
        <div>
          <button
            onClick={onExportCsv}
            className="text-xs px-2 py-1 rounded"
            style={{ background: 'transparent', border: `1px solid ${c.cardBorder}`, color: c.fg, cursor: 'pointer' }}
          >
            Export current graph as CSV
          </button>
        </div>
        {csvStatus && <div className="text-xs mt-2" style={{ color: c.muted }}>{csvStatus}</div>}
      </div>

      <div className="rounded p-3 text-sm" style={{ background: 'transparent', border: `1px solid ${c.cardBorder}` }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: c.muted }}>
          Edit graph data — {graphFileLabel ? graphFileLabel(graphFile) : graphFile}
        </div>
        <div className="text-xs mb-2" style={{ color: c.muted }}>
          Direct raw-JSON edit of this workflow's nodes and edges — for structural changes (add/remove/rewire
          nodes) without going through CSV or the canvas. Node:
          {' '}{'{ id, label, type: "tool"|"dataset"|"manual", inputs: [ids], outputs: [ids], requires: [condition keys], assumes: [free text] }'}.
          Edge: {'{ source, target, weight, requires: [condition keys], assumes: [free text] }'} — requires/assumes/weight are all optional.
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => onJsonTextChange?.(e.target.value)}
          spellCheck={false}
          className="w-full text-xs rounded p-2"
          style={{ height: 300, background: 'transparent', color: c.fg, border: `1px solid ${c.cardBorder}`, fontFamily: 'ui-monospace, monospace' }}
        />
        {jsonError && <div className="text-xs mt-2" style={{ color: '#c0392b' }}>{jsonError}</div>}
        <button
          onClick={onApplyJson}
          className="text-sm px-3 py-1.5 rounded mt-2 font-medium"
          style={{ background: RED, color: '#FFFFFF', cursor: 'pointer' }}
        >
          Apply changes
        </button>
      </div>
    </div>
  );
}
