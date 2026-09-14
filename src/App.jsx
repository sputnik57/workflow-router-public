import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import GraphCanvas from './components/GraphCanvas.jsx';
import Sidebar from './components/Sidebar.jsx';
import GoalPanel from './components/GoalPanel.jsx';
import PathCard from './components/PathCard.jsx';
import AdminPage from './components/AdminPage.jsx';
import { feasibleEdgeList, nodeFeasible, rankNodesToGoal, yenKShortestPaths, criticalPathSubgraph } from './lib/graph-algorithms.js';
import { suggestPath, proposeFromGoal } from './lib/suggest.js';
import { useTheme } from './theme.jsx';

async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json();
}

async function apiPut(url, body) {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json();
}

async function apiDelete(url) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json();
}

// Turns a business-goal query into a safe, readable graph filename --
// graphPathFor() on the server only accepts /^[a-z0-9-]+\.json$/, and
// graphFileLabel() below derives its display label straight from this stem,
// so keeping it close to the actual words (rather than a hash) is what makes
// the Workflow dropdown entry readable as the query itself.
function slugifyGoal(text) {
  const slug = (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return (slug || 'exploration') + '-graph.json';
}

function graphFileLabel(file) {
  const stem = file.replace(/\.json$/, '');
  if (stem === 'graph') return 'Content';
  return stem
    .replace(/-graph$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/, 'AI');
}

export default function App() {
  const { colors: theme, mode, setMode } = useTheme();
  const canvasBg = theme.CANVAS_BG;

  const [graph, setGraph] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [goalId, setGoalId] = useState(null);
  const [startId, setStartId] = useState(null);
  const [chosenIndex, setChosenIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [typeFilter, setTypeFilter] = useState(() => new Set());
  const [searchText, setSearchText] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [csvStatus, setCsvStatus] = useState('');
  const [metConditions, setMetConditions] = useState(() => new Set());
  const [relayoutToken, setRelayoutToken] = useState(0);
  const [resources, setResources] = useState([]);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  // Inline asset picker triggered from the first, visually-distinct option in
  // the Quick-start dropdown -- kept apart from the curated scenarios below,
  // which are all pre-verified honest paths; this one instead asks the
  // (not-yet-built) n8n workflow to invent something, so it must never blend
  // in as if it carried the same reliability guarantee.
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerChoice, setAssetPickerChoice] = useState('');
  // A pending suggestion
  // is deliberately kept OUT of `graph` -- it renders as a distinct overlay on
  // the canvas and only becomes real graph data on explicit "Accept."
  const [proposedSuggestion, setProposedSuggestion] = useState(null); // { assetId, node, edges } | null
  const [suggestionStatus, setSuggestionStatus] = useState('idle'); // 'idle' | 'loading' | 'error'
  const [suggestionError, setSuggestionError] = useState('');
  // Goal-first proposal: separate feature/state from the single-asset suggestion
  // above -- surveys ALL assets + ALL graphs for a stated business goal and
  // proposes a connected subgraph, not one node in whichever graph happens to
  // be loaded. Kept out of `graph` the same way, rendered as a distinct
  // overlay via the same generalized GraphCanvas proposedNodes/proposedEdges
  // props (merged with the asset-suggestion below), and only made real on
  // explicit Accept.
  const [goalPromptOpen, setGoalPromptOpen] = useState(false);
  const [goalPromptText, setGoalPromptText] = useState('');
  const [goalProposal, setGoalProposal] = useState(null); // { graphFile, nodes, edges, rationale } | null
  const [goalProposalStatus, setGoalProposalStatus] = useState('idle'); // 'idle' | 'loading' | 'error'
  const [goalProposalError, setGoalProposalError] = useState('');
  const [graphFile, setGraphFile] = useState('graph.json');
  const [graphFiles, setGraphFiles] = useState(['graph.json']);
  // Populated alongside graphFiles from the same /api/graphs call -- every
  // exploration graph (meta.isExploration, created by handleAcceptGoalProposal)
  // paired with its meta, so Admin > Explorations can list/delete them by
  // query text without a separate fetch per file.
  const [explorationGraphs, setExplorationGraphs] = useState([]); // [{ file, meta }]
  const [view, setView] = useState('workflow'); // 'workflow' | 'admin'
  const [saveLayoutStatus, setSaveLayoutStatus] = useState('');
  const canvasRef = useRef(null);
  const [quickStart, setQuickStart] = useState([]);
  // A quick-start pick that targets a different graph file has to wait for that
  // graph's load to finish before start/goal can be set -- otherwise the load
  // effect's own defaulting (below) overwrites them right after. This ref carries
  // the pending selection across that async gap.
  const pendingQuickStartRef = useRef(null);

  // Multiple workflow graphs can live in data/ side by side (content, sales, ...) --
  // list them once so the picker has real options instead of a hardcoded one.
  function refreshGraphFiles() {
    return apiGet('/api/graphs')
      .then((d) => {
        if (d.files?.length) setGraphFiles(d.files);
        setExplorationGraphs((d.graphs || []).filter((g) => g.meta?.isExploration));
      })
      .catch((err) => setLoadError(err.message));
  }

  useEffect(() => { refreshGraphFiles(); }, []);

  // Reload the graph whenever the selected file changes -- not just on mount,
  // so switching workflows in the picker actually swaps the displayed graph.
  useEffect(() => {
    apiGet(`/api/graph?file=${encodeURIComponent(graphFile)}`)
      .then((g) => {
        setGraph(g);
        const pending = pendingQuickStartRef.current;
        pendingQuickStartRef.current = null;
        const ids = new Set(g.nodes.map((n) => n.id));
        if (pending && ids.has(pending.goalId) && ids.has(pending.startId)) {
          setGoalId(pending.goalId);
          setStartId(pending.startId);
        } else {
          setGoalId(g.nodes[g.nodes.length - 1]?.id ?? null);
          setStartId(null);
        }
        setSelected(null);
        setMetConditions(new Set());
      })
      .catch((err) => setLoadError(err.message));
  }, [graphFile]);

  // Quick-start scenarios: a curated, hand-picked list of real business
  // questions each mapping to a known start->goal pair -- separate from the
  // technical Goal dropdown, loaded once, independent of graph reloads.
  useEffect(() => {
    apiGet('/api/quick-start')
      .then((d) => setQuickStart(d.scenarios || []))
      .catch((err) => setLoadError(err.message));
  }, []);

  function handlePickQuickStart(id) {
    const scenario = quickStart.find((s) => s.id === id);
    if (!scenario) return;
    if (scenario.graphFile !== graphFile) {
      pendingQuickStartRef.current = { startId: scenario.startId, goalId: scenario.goalId };
      setGraphFile(scenario.graphFile);
    } else {
      setGoalId(scenario.goalId);
      setStartId(scenario.startId);
    }
  }

  // The resource registry is separate from any one workflow graph -- loaded
  // once, independent of graph reloads/edits.
  useEffect(() => {
    apiGet('/api/resources')
      .then((d) => setResources(d.resources || []))
      .catch((err) => setLoadError(err.message));
  }, []);

  // Only show a pending suggestion's overlay while its own graph is still the
  // one loaded -- switching workflows mid-review shouldn't carry a stale
  // proposal onto a different graph's canvas (state itself isn't cleared, so
  // switching back still shows it).
  const activeSuggestion = proposedSuggestion && proposedSuggestion.graphFile === graphFile ? proposedSuggestion : null;
  const activeGoalProposal = goalProposal && goalProposal.graphFile === graphFile ? goalProposal : null;

  const byId = useMemo(() => (graph ? Object.fromEntries(graph.nodes.map((n) => [n.id, n])) : {}), [graph]);
  const resourcesById = useMemo(() => Object.fromEntries(resources.map((r) => [r.id, r])), [resources]);

  const allConditions = useMemo(() => {
    if (!graph) return [];
    const s = new Set();
    graph.nodes.forEach((n) => (n.requires || []).forEach((r) => s.add(r)));
    graph.edges.forEach((e) => (e.requires || []).forEach((r) => s.add(r)));
    return [...s].sort();
  }, [graph]);

  // Newly-discovered conditions default to "met" until the user unchecks them;
  // metConditions itself is the source of truth for what's currently met.
  useEffect(() => {
    setMetConditions((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const c of allConditions) {
        if (!next.has(c)) { next.add(c); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [allConditions]);

  const met = metConditions;

  function toggleCondition(c) {
    setMetConditions((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  function toggleType(nodeType) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(nodeType)) next.delete(nodeType);
      else next.add(nodeType);
      return next;
    });
  }

  const feasibleEdges = useMemo(() => (graph ? feasibleEdgeList(graph.nodes, graph.edges, met) : []), [graph, met]);
  const feasibleEdgeKeys = useMemo(() => new Set(feasibleEdges.map((e) => e.source + '>' + e.target)), [feasibleEdges]);
  const nodeFeasibleFn = useCallback((n) => nodeFeasible(n, met), [met]);

  // Goal-first ranking: recomputed whenever the goal or feasibility set changes.
  const ranked = useMemo(() => {
    if (!graph || !goalId) return null;
    return rankNodesToGoal(graph.nodes, feasibleEdges, goalId);
  }, [graph, goalId, feasibleEdges]);

  // Once both a goal and a start are picked, get the real k-shortest-paths between them.
  const candidatePaths = useMemo(() => {
    if (!graph || !goalId || !startId) return [];
    return yenKShortestPaths(graph.nodes, feasibleEdges, startId, goalId, 5);
  }, [graph, goalId, startId, feasibleEdges]);

  useEffect(() => { setChosenIndex(0); }, [startId, goalId]);

  const chosen = candidatePaths[chosenIndex] || null;

  const pathEdgeSet = useMemo(() => {
    const s = new Set();
    if (chosen) for (let i = 0; i < chosen.path.length - 1; i++) s.add(chosen.path[i] + '>' + chosen.path[i + 1]);
    return s;
  }, [chosen]);

  const pathNodeSet = useMemo(() => new Set(chosen ? chosen.path : []), [chosen]);

  async function persist(newGraph) {
    setGraph(newGraph);
    setRelayoutToken((t) => t + 1);
    try {
      await apiPut(`/api/graph?file=${encodeURIComponent(graphFile)}`, newGraph);
    } catch (err) {
      setLoadError('Save failed: ' + err.message);
    }
  }

  async function handleSuggestPath(assetId) {
    const asset = resources.find((r) => r.id === assetId);
    if (!asset) return;
    setSuggestionStatus('loading');
    setSuggestionError('');
    try {
      const result = await suggestPath(asset, graph);
      setProposedSuggestion({ assetId, graphFile, ...result });
      setSuggestionStatus('idle');
      setView('workflow'); // the overlay renders on the canvas, not in Admin
    } catch (err) {
      setSuggestionError(err.message);
      setSuggestionStatus('error');
    }
  }

  function handleAcceptSuggestion() {
    if (!proposedSuggestion || !graph) return;
    // Tag accepted nodes/edges as suggested (with the rationale that justified
    // them) so Admin > Suggestions can list and prune them later -- these
    // proposals are expected to accumulate, and not all will earn a permanent
    // place in the graph the way hand-authored nodes do.
    const acceptedAt = new Date().toISOString();
    const node = { ...proposedSuggestion.node, suggested: true, suggestedAt: acceptedAt, suggestedRationale: proposedSuggestion.rationale || '' };
    const edges = (proposedSuggestion.edges || []).map((e) => ({ ...e, suggested: true }));
    const newGraph = {
      nodes: [...graph.nodes, node],
      edges: [...graph.edges, ...edges],
    };
    persist(newGraph);
    setProposedSuggestion(null);
  }

  function handleDiscardSuggestion() {
    setProposedSuggestion(null);
    setSuggestionError('');
    setSuggestionStatus('idle');
  }

  // Goal-first proposal: unlike handleSuggestPath (which reasons over the one
  // graph already loaded), this needs every graph file's full contents up
  // front, since the LLM has to pick which ONE graph the proposed subgraph
  // attaches to -- fetched fresh each call rather than cached, since any
  // graph could have changed since app load (accepted suggestions, manual
  // edits) and a stale copy could ground the proposal in outdated weights.
  async function handleProposeFromGoal(goalText) {
    const goal = (goalText || '').trim();
    if (!goal) return;
    setGoalProposalStatus('loading');
    setGoalProposalError('');
    try {
      const entries = await Promise.all(
        graphFiles.map((f) => apiGet(`/api/graph?file=${encodeURIComponent(f)}`).then((g) => [f, g]))
      );
      const graphsByFile = Object.fromEntries(entries);
      const result = await proposeFromGoal(goal, resources, graphsByFile);
      // Carried alongside the LLM's result (not just used for the request)
      // because handleAcceptGoalProposal needs the original query text to
      // name the new exploration graph file/label -- the input box itself
      // gets cleared right after this call returns.
      setGoalProposal({ ...result, goal });
      setGoalProposalStatus('idle');
      setView('workflow'); // the overlay renders on the canvas, not in Admin
      // The proposal may target a different graph than whatever's currently
      // loaded -- switch to it so activeGoalProposal (which requires
      // goalProposal.graphFile === graphFile) actually shows the overlay
      // instead of silently doing nothing until the user happens to pick the
      // right workflow themselves.
      if (result.graphFile && result.graphFile !== graphFile) setGraphFile(result.graphFile);
    } catch (err) {
      setGoalProposalError(err.message);
      setGoalProposalStatus('error');
    }
  }

  // Accepting a goal-proposal does NOT merge into whichever graph it
  // attached to (that's what handleAcceptSuggestion does for the single-
  // asset feature) -- it creates a brand-new, self-contained exploration
  // graph, since merging would permanently mix experimental, LLM-proposed
  // steps into Sales/Marketing/whatever real graph happened to be picked as
  // the attachment point. The new file gets the LLM's proposed nodes/edges
  // PLUS the real critical-path nodes/edges those anchors sit in (via
  // criticalPathSubgraph), so it reads as a complete story on its own rather
  // than a few floating new nodes with no context -- then shows up as its
  // own entry in the Workflow dropdown, named after the query itself.
  async function handleAcceptGoalProposal() {
    if (!goalProposal) return;
    const acceptedAt = new Date().toISOString();

    const sourceGraph = await apiGet(`/api/graph?file=${encodeURIComponent(goalProposal.graphFile)}`);
    const proposedNodeIds = new Set((goalProposal.nodes || []).map((n) => n.id));
    const anchorIds = [...new Set(
      (goalProposal.edges || []).flatMap((e) => [e.source, e.target]).filter((id) => !proposedNodeIds.has(id))
    )];
    const { nodes: pathNodes, edges: pathEdges } = criticalPathSubgraph(sourceGraph.nodes, sourceGraph.edges, anchorIds);

    const newNodes = (goalProposal.nodes || []).map((n) => ({
      ...n, suggested: true, suggestedAt: acceptedAt, suggestedRationale: goalProposal.rationale || '',
    }));
    const newEdges = (goalProposal.edges || []).map((e) => ({ ...e, suggested: true }));

    const explorationGraph = {
      meta: {
        isExploration: true,
        query: goalProposal.goal || '',
        sourceGraphFile: goalProposal.graphFile,
        createdAt: acceptedAt,
      },
      nodes: [...pathNodes, ...newNodes],
      edges: [...pathEdges, ...newEdges],
    };

    let fileName = slugifyGoal(goalProposal.goal);
    let n = 2;
    while (graphFiles.includes(fileName)) {
      fileName = slugifyGoal(goalProposal.goal).replace(/-graph\.json$/, `-${n}-graph.json`);
      n++;
    }

    await apiPut(`/api/graph?file=${encodeURIComponent(fileName)}`, explorationGraph);
    await refreshGraphFiles();
    setGraphFile(fileName);
    setGoalProposal(null);
  }

  // Whole-file delete for an exploration graph (Admin > Explorations) --
  // separate from handleDeleteSuggested, which prunes one node inside
  // whatever real graph is currently targeted. The server refuses this for
  // any file without meta.isExploration, but bail out client-side too if
  // the currently-open graph is the one being removed, rather than leaving
  // the UI pointed at a file that no longer exists.
  async function handleDeleteExplorationGraph(file) {
    await apiDelete(`/api/graph?file=${encodeURIComponent(file)}`);
    await refreshGraphFiles();
    if (graphFile === file) setGraphFile('graph.json');
  }

  function handleDiscardGoalProposal() {
    setGoalProposal(null);
    setGoalProposalError('');
    setGoalProposalStatus('idle');
  }

  // Admin > Suggestions "delete" -- removes a previously-accepted suggested
  // node plus any edges touching it (a freshly-accepted node's only edges are
  // the ones the suggestion added, so this can't orphan unrelated hand-authored
  // connections) and persists via the same save path as any other graph edit.
  function handleDeleteSuggested(nodeId) {
    if (!graph) return;
    const newGraph = {
      nodes: graph.nodes.filter((n) => n.id !== nodeId),
      edges: graph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    };
    persist(newGraph);
  }

  function handlePickGoal(id) {
    setGoalId(id);
    setStartId(null);
  }

  function handleApplyJson() {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        throw new Error('Expected an object with "nodes" and "edges" arrays.');
      }
      persist(parsed);
      setJsonError('');
      setStartId(null);
      const ids = parsed.nodes.map((n) => n.id);
      if (!ids.includes(goalId)) setGoalId(ids[ids.length - 1] ?? null);
    } catch (err) {
      setJsonError(err.message);
    }
  }

  async function handleCsvFiles(e) {
    const files = Array.from(e.target.files || []);
    const nodesFile = files.find((f) => /nodes/i.test(f.name));
    const edgesFile = files.find((f) => /edges/i.test(f.name));
    if (!nodesFile && !edgesFile) {
      setCsvStatus('Name your files so one contains "nodes" and the other "edges".');
      return;
    }
    const [nodesCsv, edgesCsv] = await Promise.all([
      nodesFile ? nodesFile.text() : Promise.resolve(''),
      edgesFile ? edgesFile.text() : Promise.resolve(''),
    ]);
    try {
      const merged = await fetch(`/api/graph/import-csv?file=${encodeURIComponent(graphFile)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodesCsv, edgesCsv }),
      }).then((r) => r.json());
      setGraph(merged);
      setCsvStatus(`Imported ${merged.nodes.length} nodes, ${merged.edges.length} edges.`);
    } catch (err) {
      setCsvStatus('Import failed: ' + err.message);
    }
  }

  // Persists exactly what's on screen (drag adjustments included) as each
  // node's x/y, so future loads and window resizes reuse this arrangement
  // instead of re-running the force simulation from scratch. Calls the API
  // directly rather than through persist() so it doesn't also bump
  // relayoutToken and immediately discard what it just saved.
  async function handleSaveLayout() {
    const positions = canvasRef.current?.getPositions();
    if (!graph || !positions || Object.keys(positions).length === 0) return;
    const newGraph = {
      ...graph,
      nodes: graph.nodes.map((n) => (positions[n.id] ? { ...n, x: positions[n.id].x, y: positions[n.id].y } : n)),
    };
    setGraph(newGraph);
    try {
      await apiPut(`/api/graph?file=${encodeURIComponent(graphFile)}`, newGraph);
      setSaveLayoutStatus('Layout saved.');
    } catch (err) {
      setSaveLayoutStatus('Save failed: ' + err.message);
    }
  }

  async function handleExportCsv() {
    const { nodesCsv, edgesCsv } = await apiGet(`/api/graph/export-csv?file=${encodeURIComponent(graphFile)}`);
    for (const [name, text] of [['nodes.csv', nodesCsv], ['edges.csv', edgesCsv]]) {
      const blob = new Blob([text], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const assetHighlightSet = useMemo(() => {
    if (!graph || !selectedAssetId) return null;
    return new Set(graph.nodes.filter((n) => n.resourceId === selectedAssetId).map((n) => n.id));
  }, [graph, selectedAssetId]);

  const assetLinkedNodeLabels = useMemo(() => {
    if (!assetHighlightSet) return [];
    return graph.nodes.filter((n) => assetHighlightSet.has(n.id)).map((n) => n.label);
  }, [graph, assetHighlightSet]);

  const sortedNodes = useMemo(
    () => (graph ? [...graph.nodes].sort((a, b) => a.label.localeCompare(b.label)) : []),
    [graph]
  );

  // GraphCanvas renders one generalized proposed-overlay regardless of which
  // feature produced it -- merge whichever of the two is active (in practice
  // just one at a time, but nothing stops both) into single arrays here so
  // the canvas itself doesn't need to know these are two separate features.
  const proposedNodesForCanvas = useMemo(() => [
    ...(activeSuggestion?.node ? [activeSuggestion.node] : []),
    ...(activeGoalProposal?.nodes || []),
  ], [activeSuggestion, activeGoalProposal]);

  const proposedEdgesForCanvas = useMemo(() => [
    ...(activeSuggestion?.edges || []),
    ...(activeGoalProposal?.edges || []),
  ], [activeSuggestion, activeGoalProposal]);

  if (loadError && !graph) {
    return <div style={{ background: theme.BG, color: theme.WARN, padding: 24 }}>Failed to load graph: {loadError}</div>;
  }
  if (!graph) {
    return <div style={{ background: theme.BG, color: theme.MUTED, padding: 24 }}>Loading…</div>;
  }

  return (
    <div style={{ background: theme.BG, color: theme.TEXT, minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div className="p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h1 className="font-semibold" style={{ letterSpacing: '-0.01em' }}>
              <span className="text-xl">Workflow Router</span>{' '}
              <span className="text-sm font-normal" style={{ color: theme.MUTED }}>
                by te<span style={{ color: '#DF2521', fontWeight: 700 }}>K</span>noculture
              </span>
            </h1>
            <p className="text-sm mt-1" style={{ color: theme.MUTED, maxWidth: 680 }}>
              Most solopreneurs carry their whole business in their head. Workflow Router puts it
              on a map instead: every tool, dataset, and step, connected. Find the fastest path to
              a goal, spot new opportunities, and track progress once work is handed off to an
              agent. It's an advanced dashboard to your operating workflows.
            </p>
            {loadError && <p className="text-sm mt-1" style={{ color: theme.WARN }}>{loadError}</p>}
          </div>
          <div className="flex gap-2">
            <div className="flex gap-1 mr-2">
              <button
                onClick={() => setMode('light')}
                className="text-sm px-3 py-1.5 rounded"
                style={{ background: mode === 'light' ? theme.ACCENT : 'transparent', color: mode === 'light' ? theme.ON_ACCENT : theme.TEXT, border: `1px solid ${theme.BORDER}`, cursor: 'pointer' }}
              >
                Light
              </button>
              <button
                onClick={() => setMode('dark')}
                className="text-sm px-3 py-1.5 rounded"
                style={{ background: mode === 'dark' ? theme.ACCENT : 'transparent', color: mode === 'dark' ? theme.ON_ACCENT : theme.TEXT, border: `1px solid ${theme.BORDER}`, cursor: 'pointer' }}
              >
                Dark
              </button>
            </div>
            <button
              onClick={() => setView('workflow')}
              className="text-sm px-3 py-1.5 rounded"
              style={{ background: view === 'workflow' ? theme.ACCENT : 'transparent', color: view === 'workflow' ? theme.ON_ACCENT : theme.TEXT, border: `1px solid ${theme.BORDER}`, cursor: 'pointer' }}
            >
              Workflows
            </button>
            <button
              onClick={() => setView('admin')}
              className="text-sm px-3 py-1.5 rounded"
              style={{ background: view === 'admin' ? theme.ACCENT : 'transparent', color: view === 'admin' ? theme.ON_ACCENT : theme.TEXT, border: `1px solid ${theme.BORDER}`, cursor: 'pointer' }}
            >
              Admin
            </button>
          </div>
        </div>

        {view === 'admin' && (
          <AdminPage
            resources={resources}
            selectedAssetId={selectedAssetId}
            onSelectAsset={setSelectedAssetId}
            linkedNodeLabels={assetLinkedNodeLabels}
            graphFile={graphFile}
            graphFiles={graphFiles}
            graphFileLabel={graphFileLabel}
            onSwitchGraph={setGraphFile}
            onCsvFiles={handleCsvFiles}
            onExportCsv={handleExportCsv}
            csvStatus={csvStatus}
            graph={graph}
            jsonText={jsonText}
            onJsonTextChange={setJsonText}
            jsonError={jsonError}
            onApplyJson={handleApplyJson}
            onDeleteSuggested={handleDeleteSuggested}
            explorationGraphs={explorationGraphs}
            onDeleteExplorationGraph={handleDeleteExplorationGraph}
          />
        )}

        {view === 'workflow' && (
        <>
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div style={{ width: 200 }}>
            <label className="block text-xs mb-1" style={{ color: theme.MUTED }}>Workflow</label>
            <select
              value={graphFile}
              onChange={(e) => setGraphFile(e.target.value)}
              className="text-sm px-2 py-1.5 rounded"
              style={{ background: theme.PANEL, border: `1px solid ${theme.BORDER}`, color: theme.TEXT, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {graphFiles.map((f) => <option key={f} value={f} title={graphFileLabel(f)}>{graphFileLabel(f)}</option>)}
            </select>
          </div>
          <div style={{ width: 200 }}>
            <label className="block text-xs mb-1" style={{ color: theme.MUTED }}>Node</label>
            <select
              value={goalId ?? ''}
              onChange={(e) => handlePickGoal(e.target.value)}
              className="text-sm px-2 py-1.5 rounded"
              style={{ background: theme.PANEL, border: `1px solid ${theme.BORDER}`, color: theme.TEXT, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {sortedNodes.map((n) => <option key={n.id} value={n.id} title={n.label}>{n.label}</option>)}
            </select>
          </div>
          {quickStart.length > 0 && (
            <div style={{ width: 200 }}>
              <label className="block text-xs mb-1" style={{ color: theme.MUTED }}>Ask a business question</label>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value === '__suggest__') { setAssetPickerOpen(true); return; }
                  if (e.target.value === '__propose_goal__') { setGoalPromptOpen(true); return; }
                  if (e.target.value) handlePickQuickStart(e.target.value);
                }}
                className="text-sm px-2 py-1.5 rounded"
                style={{ background: theme.PANEL, border: `1px solid ${theme.BORDER}`, color: theme.TEXT, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                <option value="">Pick a question…</option>
                <option value="__suggest__" title="Asks an LLM to propose a brand-new, unverified connection -- unlike every question below, which is a pre-verified, known-working path.">
                  Suggest a new path using an asset…
                </option>
                <option value="__propose_goal__" title="Surveys every asset and every workflow at once and proposes a whole new connected subgraph for a stated business goal -- broader and less certain than the single-asset suggestion above.">
                  Propose a new workflow for a business goal…
                </option>
                <option disabled>──────────</option>
                {quickStart.map((s) => <option key={s.id} value={s.id} title={s.question}>{s.question}</option>)}
              </select>
              {goalPromptOpen && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={goalPromptText}
                    onChange={(e) => setGoalPromptText(e.target.value)}
                    placeholder="e.g. lead gen, faster onboarding…"
                    className="text-sm px-2 py-1.5 rounded"
                    style={{ background: theme.PANEL, border: `1px solid ${theme.ACCENT_ALT}`, color: theme.TEXT, flex: '1 1 auto', minWidth: 0 }}
                  />
                  <button
                    onClick={() => { if (goalPromptText.trim()) { handleProposeFromGoal(goalPromptText); setGoalPromptOpen(false); setGoalPromptText(''); } }}
                    disabled={!goalPromptText.trim() || goalProposalStatus === 'loading'}
                    className="text-xs px-2 py-1.5 rounded font-medium"
                    style={{ background: theme.ACCENT_ALT, color: theme.ON_ACCENT, cursor: goalPromptText.trim() ? 'pointer' : 'default' }}
                  >
                    {goalProposalStatus === 'loading' ? 'Proposing…' : 'Propose'}
                  </button>
                  <button
                    onClick={() => { setGoalPromptOpen(false); setGoalPromptText(''); }}
                    className="text-xs px-2 py-1.5 rounded"
                    style={{ background: 'transparent', border: `1px solid ${theme.BORDER}`, color: theme.MUTED, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {goalProposalStatus === 'error' && goalProposalError && (
                <div className="text-xs mt-1" style={{ color: theme.WARN }}>{goalProposalError}</div>
              )}
              {assetPickerOpen && (
                <div className="flex items-center gap-2 mt-2">
                  <select
                    value={assetPickerChoice}
                    onChange={(e) => setAssetPickerChoice(e.target.value)}
                    className="text-sm px-2 py-1.5 rounded"
                    style={{ background: theme.PANEL, border: `1px solid ${theme.ACCENT_ALT}`, color: theme.TEXT, flex: '1 1 auto', minWidth: 0 }}
                  >
                    <option value="">Pick an asset…</option>
                    {resources.map((r) => <option key={r.id} value={r.id} title={r.description || r.name}>{r.name}</option>)}
                  </select>
                  <button
                    onClick={() => { if (assetPickerChoice) { handleSuggestPath(assetPickerChoice); setAssetPickerOpen(false); setAssetPickerChoice(''); } }}
                    disabled={!assetPickerChoice || suggestionStatus === 'loading'}
                    className="text-xs px-2 py-1.5 rounded font-medium"
                    style={{ background: theme.ACCENT_ALT, color: theme.ON_ACCENT, cursor: assetPickerChoice ? 'pointer' : 'default' }}
                  >
                    {suggestionStatus === 'loading' ? 'Suggesting…' : 'Suggest'}
                  </button>
                  <button
                    onClick={() => { setAssetPickerOpen(false); setAssetPickerChoice(''); }}
                    className="text-xs px-2 py-1.5 rounded"
                    style={{ background: 'transparent', border: `1px solid ${theme.BORDER}`, color: theme.MUTED, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {suggestionStatus === 'error' && suggestionError && (
                <div className="text-xs mt-1" style={{ color: theme.WARN }}>{suggestionError}</div>
              )}
            </div>
          )}
        </div>

        {activeSuggestion && (
          <div className="mb-3 text-sm px-3 py-2 rounded" style={{ background: theme.PANEL, border: `1px dashed ${theme.ACCENT_ALT}` }}>
            <div className="flex items-center gap-3 mb-1">
              <span>
                Proposed: <strong>{activeSuggestion.node?.label}</strong> — shown dashed on the canvas below. Not saved yet.
              </span>
              <button
                onClick={handleAcceptSuggestion}
                className="text-xs px-2 py-1 rounded font-medium"
                style={{ background: theme.ACCENT, color: theme.ON_ACCENT, cursor: 'pointer' }}
              >
                Accept into graph
              </button>
              <button
                onClick={handleDiscardSuggestion}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'transparent', border: `1px solid ${theme.BORDER}`, color: theme.TEXT, cursor: 'pointer' }}
              >
                Discard
              </button>
            </div>
            {/* Rationale is what actually makes a NOVEL node judgeable -- unlike
                an existing node's assumes text (describing lived practice you
                already know), a suggested node is unfamiliar by definition, so
                its reasoning has to be shown up front, not left to a hover. */}
            {(activeSuggestion.rationale || activeSuggestion.node?.assumes?.length > 0) && (
              <ul className="text-xs mt-1" style={{ color: theme.MUTED, paddingLeft: 16 }}>
                {activeSuggestion.rationale && <li>{activeSuggestion.rationale}</li>}
                {(activeSuggestion.node?.assumes || []).map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            )}
          </div>
        )}

        {activeGoalProposal && (
          <div className="mb-3 text-sm px-3 py-2 rounded" style={{ background: theme.PANEL, border: `1px dashed ${theme.ACCENT_ALT}` }}>
            <div className="flex items-center gap-3 mb-1">
              <span>
                Proposed workflow: <strong>{(activeGoalProposal.nodes || []).length} new step{(activeGoalProposal.nodes || []).length === 1 ? '' : 's'}</strong> in {graphFileLabel(activeGoalProposal.graphFile)} — shown dashed on the canvas below. Not saved yet.
              </span>
              <button
                onClick={handleAcceptGoalProposal}
                className="text-xs px-2 py-1 rounded font-medium"
                style={{ background: theme.ACCENT, color: theme.ON_ACCENT, cursor: 'pointer' }}
              >
                Accept into graph
              </button>
              <button
                onClick={handleDiscardGoalProposal}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'transparent', border: `1px solid ${theme.BORDER}`, color: theme.TEXT, cursor: 'pointer' }}
              >
                Discard
              </button>
            </div>
            {activeGoalProposal.rationale && (
              <ul className="text-xs mt-1" style={{ color: theme.MUTED, paddingLeft: 16 }}>
                <li>{activeGoalProposal.rationale}</li>
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-4">
          <div className="rounded overflow-hidden" style={{ border: `1px solid ${theme.BORDER}`, background: canvasBg, flex: '1 1 auto', height: '75vh', minHeight: 500, position: 'relative' }}>
            <div className="flex flex-col items-end gap-1" style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}>
              <div className="flex gap-1 p-1 rounded" style={{ background: theme.PANEL, border: `1px solid ${theme.BORDER}`, opacity: 0.9 }}>
                <button
                  onClick={() => setRelayoutToken((t) => t + 1)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ background: 'transparent', border: `1px solid ${theme.BORDER}`, color: theme.TEXT, cursor: 'pointer' }}
                  title="Reset every node back to its auto-computed position. Use this after dragging nodes around has left the graph tangled or hard to read."
                >
                  Reset layout
                </button>
                <button
                  onClick={handleSaveLayout}
                  className="text-xs px-2 py-1 rounded"
                  style={{ background: 'transparent', border: `1px solid ${theme.BORDER}`, color: theme.TEXT, cursor: 'pointer' }}
                  title="Save the current node positions (including any you've dragged) as this workflow's default — future loads and window resizes will reuse this arrangement instead of recomputing one."
                >
                  Save layout
                </button>
              </div>
              {saveLayoutStatus && (
                <div className="text-xs px-2 py-1 rounded" style={{ background: theme.PANEL, border: `1px solid ${theme.BORDER}`, color: theme.MUTED, opacity: 0.9 }}>
                  {saveLayoutStatus}
                </div>
              )}
            </div>
            <GraphCanvas
              ref={canvasRef}
              nodes={graph.nodes}
              edges={graph.edges}
              feasibleEdgeKeys={feasibleEdgeKeys}
              nodeFeasibleFn={nodeFeasibleFn}
              pathNodeSet={pathNodeSet}
              pathEdgeSet={pathEdgeSet}
              startId={startId}
              goalId={goalId}
              onSelectNode={setSelected}
              typeFilter={typeFilter}
              searchText={searchText}
              relayoutToken={relayoutToken}
              assetHighlightSet={assetHighlightSet}
              proposedNodes={proposedNodesForCanvas}
              proposedEdges={proposedEdgesForCanvas}
            />
          </div>

          <Sidebar
            byId={byId}
            selectedId={selected}
            allConditions={allConditions}
            met={met}
            onToggleCondition={toggleCondition}
            typeFilter={typeFilter}
            onToggleType={toggleType}
            searchText={searchText}
            onSearchChange={setSearchText}
            resourcesById={resourcesById}
          />
        </div>

        <div className="mt-4">
          <GoalPanel ranked={ranked} selectedStartId={startId} onPickStart={setStartId} />
        </div>

        {startId && (
          <div className="mt-4">
            {candidatePaths.length === 0 ? (
              <div className="text-sm px-3 py-2 rounded" style={{ background: theme.PANEL, border: `1px solid ${theme.BORDER}`, color: theme.WARN }}>
                No path exists between these two nodes given the dependencies currently marked as unmet.
              </div>
            ) : (
              candidatePaths.map((data, i) => (
                <PathCard
                  key={i}
                  label={i === 0 ? 'Lowest-cost path' : `Alternative ${i + 1}`}
                  data={data}
                  isChosen={chosenIndex === i}
                  accent={theme.PATH_ACCENTS[i % theme.PATH_ACCENTS.length]}
                  byId={byId}
                  edges={graph.edges}
                  met={met}
                  onChoose={() => setChosenIndex(i)}
                />
              ))
            )}
          </div>
        )}

        </>
        )}
      </div>
    </div>
  );
}
