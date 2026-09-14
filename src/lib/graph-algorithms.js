// Graph algorithms for the workflow router: feasibility filtering (unchanged from the
// original prototype), single-source Dijkstra, Yen's k-shortest-paths, and the
// reversed-graph "rank every node by cost to reach the goal" computation used by the
// goal-first flow.

export function nodeFeasible(node, met) {
  // A node explicitly marked not-built/out-of-scope is infeasible unconditionally --
  // no checkbox toggle should ever make an unbuilt tool "available."
  if (node.status === 'not-built' || node.status === 'out-of-scope') return false;
  return (node.requires || []).every((r) => met.has(r));
}

export function feasibleEdgeList(nodes, edges, met) {
  const nf = new Map(nodes.map((n) => [n.id, nodeFeasible(n, met)]));
  return edges.filter((e) => {
    if (!(e.requires || []).every((r) => met.has(r))) return false;
    if (nf.get(e.source) === false) return false;
    if (nf.get(e.target) === false) return false;
    return true;
  });
}

function buildAdjacency(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source).push({ to: e.target, weight: e.weight ?? 1 });
  });
  return adj;
}

// Single-source shortest paths from `sourceId` to every reachable node.
// O(V^2) — plenty fast at the 50-100 node scale this tool targets.
export function dijkstraFromSource(nodes, edges, sourceId) {
  const adj = buildAdjacency(nodes, edges);
  const dist = new Map(nodes.map((n) => [n.id, Infinity]));
  const prev = new Map();
  const visited = new Set();
  dist.set(sourceId, 0);
  while (visited.size < nodes.length) {
    let u = null, best = Infinity;
    for (const [id, d] of dist) if (!visited.has(id) && d < best) { best = d; u = id; }
    if (u === null) break;
    visited.add(u);
    for (const { to, weight } of adj.get(u) || []) {
      const nd = dist.get(u) + weight;
      if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, u); }
    }
  }
  return { dist, prev };
}

export function shortestPath(nodes, edges, startId, goalId) {
  const { dist, prev } = dijkstraFromSource(nodes, edges, startId);
  if (!isFinite(dist.get(goalId))) return null;
  const path = [goalId];
  let cur = goalId;
  while (cur !== startId) {
    cur = prev.get(cur);
    if (cur === undefined) return null;
    path.unshift(cur);
  }
  return { path, cost: dist.get(goalId) };
}

function reverseEdges(edges) {
  return edges.map((e) => ({ ...e, source: e.target, target: e.source }));
}

// Goal-first ranking: every node that can reach `goalId`, with its total cost,
// computed with a single Dijkstra run on the reversed graph from the goal —
// far cheaper than running shortestPath() once per candidate start node.
export function rankNodesToGoal(nodes, edges, goalId) {
  const reversed = reverseEdges(edges);
  const { dist } = dijkstraFromSource(nodes, reversed, goalId);
  return nodes
    .filter((n) => n.id !== goalId && isFinite(dist.get(n.id)))
    .map((n) => ({ id: n.id, label: n.label, cost: dist.get(n.id) }))
    .sort((a, b) => a.cost - b.cost);
}

function pathArraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function pathCost(edges, path) {
  const edgeMap = new Map(edges.map((e) => [e.source + '>' + e.target, e.weight ?? 1]));
  let cost = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const w = edgeMap.get(path[i] + '>' + path[i + 1]);
    if (w === undefined) return Infinity;
    cost += w;
  }
  return cost;
}

// Yen's k-shortest-paths (loopless), standard spur-node/root-path formulation.
// Replaces the prototype's single-edge-removal "alternative path" heuristic with
// real ranked alternatives.
// Given a full graph and a set of "anchor" node ids (existing real nodes a
// goal-proposal's new edges attach to), returns the minimal real nodes/edges
// needed to show the FULL real path each anchor sits in -- not just the bare
// anchor node itself. For each anchor: the best path forward to the graph's
// own terminal node (last node in `nodes`, matching the app's own
// default-goal convention elsewhere), and the best path backward from
// whichever true root node (a node with zero incoming edges -- a real entry
// point like a lead source) reaches it most cheaply. An anchor that's
// unreachable from any root, or can't reach the terminal, still contributes
// whichever half is real -- this never throws away an anchor for having only
// one real side.
export function criticalPathSubgraph(nodes, edges, anchorIds) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const terminalId = nodes[nodes.length - 1]?.id;
  const targets = new Set(edges.map((e) => e.target));
  const rootIds = nodes.filter((n) => !targets.has(n.id)).map((n) => n.id);

  const keepNodeIds = new Set();
  const keepEdgeKeys = new Set();
  const addPath = (path) => {
    if (!path) return;
    path.forEach((id) => keepNodeIds.add(id));
    for (let i = 0; i < path.length - 1; i++) keepEdgeKeys.add(path[i] + '>' + path[i + 1]);
  };

  for (const anchorId of anchorIds) {
    if (!nodeById.has(anchorId)) continue; // anchor lives in a different graph file -- not representable here
    keepNodeIds.add(anchorId);
    if (terminalId && anchorId !== terminalId) {
      addPath(shortestPath(nodes, edges, anchorId, terminalId)?.path);
    }
    const cheapestRoot = rankNodesToGoal(nodes, edges, anchorId).find((r) => rootIds.includes(r.id));
    if (cheapestRoot) {
      addPath(shortestPath(nodes, edges, cheapestRoot.id, anchorId)?.path);
    }
  }

  return {
    nodes: nodes.filter((n) => keepNodeIds.has(n.id)),
    edges: edges.filter((e) => keepEdgeKeys.has(e.source + '>' + e.target)),
  };
}

export function yenKShortestPaths(nodes, edges, startId, goalId, K = 5) {
  const first = shortestPath(nodes, edges, startId, goalId);
  if (!first) return [];
  const A = [first];
  const B = [];

  for (let k = 1; k < K; k++) {
    const prevPath = A[k - 1].path;
    for (let i = 0; i < prevPath.length - 1; i++) {
      const spurNode = prevPath[i];
      const rootPath = prevPath.slice(0, i + 1);

      const removedEdgeKeys = new Set();
      for (const a of A) {
        if (a.path.length > i && pathArraysEqual(a.path.slice(0, i + 1), rootPath)) {
          removedEdgeKeys.add(a.path[i] + '>' + a.path[i + 1]);
        }
      }
      const removedNodes = new Set(rootPath.slice(0, -1)); // root path nodes except the spur node itself

      const filteredEdges = edges.filter((e) => {
        if (removedEdgeKeys.has(e.source + '>' + e.target)) return false;
        if (removedNodes.has(e.source) || removedNodes.has(e.target)) return false;
        return true;
      });

      const spurPath = shortestPath(nodes, filteredEdges, spurNode, goalId);
      if (spurPath) {
        const totalPath = [...rootPath.slice(0, -1), ...spurPath.path];
        const cost = pathCost(edges, rootPath) + spurPath.cost;
        const key = totalPath.join('>');
        if (!A.some((a) => a.path.join('>') === key) && !B.some((b) => b.path.join('>') === key)) {
          B.push({ path: totalPath, cost });
        }
      }
    }
    if (B.length === 0) break;
    B.sort((a, b) => a.cost - b.cost);
    A.push(B.shift());
  }
  return A;
}
