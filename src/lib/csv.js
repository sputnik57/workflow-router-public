// CSV <-> graph JSON conversion. Schema (see README.md):
//   nodes.csv: id, label, type, inputs, outputs, requires, assumes
//   edges.csv: source, target, weight, requires, assumes
// List-valued fields (inputs/outputs/requires/assumes) are semicolon-separated within a cell.

import Papa from 'papaparse';

function splitList(cell) {
  if (!cell) return [];
  return String(cell)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinList(list) {
  return (list || []).join(';');
}

export function parseNodesCsv(text) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  return data.map((row) => {
    const node = {
      id: row.id?.trim(),
      label: row.label?.trim() || row.id?.trim(),
      type: row.type?.trim() || 'tool',
      inputs: splitList(row.inputs),
      outputs: splitList(row.outputs),
    };
    const requires = splitList(row.requires);
    const assumes = splitList(row.assumes);
    if (requires.length) node.requires = requires;
    if (assumes.length) node.assumes = assumes;
    return node;
  });
}

export function parseEdgesCsv(text) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  return data.map((row) => {
    const edge = {
      source: row.source?.trim(),
      target: row.target?.trim(),
      weight: row.weight ? Number(row.weight) : 1,
    };
    const requires = splitList(row.requires);
    const assumes = splitList(row.assumes);
    if (requires.length) edge.requires = requires;
    if (assumes.length) edge.assumes = assumes;
    return edge;
  });
}

export function nodesToCsv(nodes) {
  const rows = nodes.map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    inputs: joinList(n.inputs),
    outputs: joinList(n.outputs),
    requires: joinList(n.requires),
    assumes: joinList(n.assumes),
  }));
  return Papa.unparse(rows);
}

export function edgesToCsv(edges) {
  const rows = edges.map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight ?? 1,
    requires: joinList(e.requires),
    assumes: joinList(e.assumes),
  }));
  return Papa.unparse(rows);
}

// Merge parsed CSV nodes/edges into an existing graph: existing ids get updated
// in place, new ids get appended. Edges are keyed on source+target (an import
// that re-lists an existing edge updates its weight/requires/assumes).
export function mergeGraph(existing, { nodes: newNodes, edges: newEdges }) {
  const nodeMap = new Map(existing.nodes.map((n) => [n.id, n]));
  for (const n of newNodes || []) nodeMap.set(n.id, n);

  const edgeMap = new Map(existing.edges.map((e) => [e.source + '>' + e.target, e]));
  for (const e of newEdges || []) edgeMap.set(e.source + '>' + e.target, e);

  return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
}
