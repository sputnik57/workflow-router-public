// Portfolio scan -- a whole-registry idle-asset report.
//
// Deliberately NOT the same capability as the single-asset/goal-first
// suggestion features (which need a question or an asset picked first,
// scoped to one graph at a time). This is unprompted and whole-registry: no
// question required, spans every hand-authored graph at once. The point
// isn't spotting new business blind spots to chase -- it's seeing what's
// already in inventory and not yet being used, so current assets get
// maximized before looking for anything new.
//
// Deliberately simple: no LLM call, just a plain report using the
// compatibility check that already exists.

import { findCompatibleTargets } from './compatibility.js';

// graphsByFile: { [filename]: { nodes, edges } } -- every REAL (non-
// exploration) graph. Exploration graphs are excluded by the caller since
// they're LLM-proposed, unverified content -- mixing them in would skew
// "idle" results with resourceId links nobody actually confirmed.
export function scanIdleAssets(resources, graphsByFile) {
  // Tag each node with its source file while flattening, so deadEnd entries
  // can say which graph they came from without a second lookup pass.
  const allNodes = Object.entries(graphsByFile).flatMap(([file, g]) =>
    (g.nodes || []).map((n) => ({ ...n, __file: file }))
  );
  const referencedResourceIds = new Set(allNodes.map((n) => n.resourceId).filter(Boolean));

  // Tier 1: never referenced by any node in any graph at all -- the clearest
  // case of an owned asset sitting completely unused.
  const unreferenced = resources
    .filter((r) => !referencedResourceIds.has(r.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Tier 2: linked to a real node somewhere, but that node's own output type
  // has no compatible consumer anywhere across the whole registry -- wired
  // in, but still a dead end nobody can build on top of.
  const deadEnd = [];
  for (const n of allNodes) {
    if (!n.resourceId || !n.producesType) continue;
    const others = allNodes.filter((o) => o !== n);
    if (findCompatibleTargets(others, n.producesType).length === 0) {
      const resource = resources.find((r) => r.id === n.resourceId);
      if (resource) deadEnd.push({ resource, node: n, file: n.__file });
    }
  }
  deadEnd.sort((a, b) => a.resource.name.localeCompare(b.resource.name));

  return { unreferenced, deadEnd };
}
