// Semantic-type compatibility checking.
// Distinct from the existing `inputs`/`outputs` node fields, which are literal
// backreferences to already-connected neighbor node ids (redundant with the
// `edges` array) -- those can't tell you anything about a brand-new proposed
// connection that doesn't exist yet. `producesType`/`acceptsTypes` instead
// classify what KIND of thing a node produces/consumes, from the closed
// vocabulary in data/semantic-types.json, so a hypothetical new edge can be
// checked for plausibility before it's ever added to a graph.

// Whether a proposed edge from `sourceNode` to `targetNode` makes semantic
// sense: does the source's producesType appear in the target's acceptsTypes?
// Nodes missing either field are treated as unconstrained (compatible) --
// this is additive typing, not every node in every graph has been typed for
// every use case yet, and an unlabeled node shouldn't block a suggestion.
export function nodesCompatible(sourceNode, targetNode) {
  const produces = sourceNode?.producesType;
  const accepts = targetNode?.acceptsTypes;
  if (!produces || !accepts || accepts.length === 0) return true;
  return accepts.includes(produces);
}

// Same check by id, given the graph's full node list -- the more common
// call shape from suggestion logic, which works with ids until it needs to
// render something.
export function edgeCompatible(nodes, sourceId, targetId) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return nodesCompatible(byId[sourceId], byId[targetId]);
}

// For a candidate new node (e.g. one derived from an asset in resources.json,
// not yet part of any graph) with a given producesType, find every existing
// node in `nodes` whose acceptsTypes would take it -- the actual question a
// suggestion feature asks: "where in this graph could this asset plug in?"
export function findCompatibleTargets(nodes, producesType) {
  if (!producesType) return [];
  return nodes.filter((n) => (n.acceptsTypes || []).includes(producesType));
}
