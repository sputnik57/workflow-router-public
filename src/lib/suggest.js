// Suggestion-provider interface.
//
// Default implementation: a direct call to OpenRouter's chat-completions API,
// using your own API key (VITE_OPENROUTER_API_KEY in .env.local). This key is
// bundled into the client-side JS bundle by Vite -- fine for running this app
// locally on your own machine, but do NOT deploy a build of this app to a
// public server with a real key baked in, since anyone loading the page could
// read it out of the bundle. Get a key at https://openrouter.ai/keys.
//
// The `provider` param is a documented extension seam: an n8n-routed call (if
// you'd rather keep the LLM call out of the client entirely), a different
// direct API (OpenAI, Anthropic), or an agent-routed call (OpenClaw, Hermes)
// can be added as another branch here without touching any calling code.

const OPENROUTER_API_KEY = import.meta.env?.VITE_OPENROUTER_API_KEY;
const OPENROUTER_MODEL = import.meta.env?.VITE_OPENROUTER_MODEL || 'anthropic/claude-opus-5';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function callOpenRouter(systemPrompt, userPrompt, schemaName, schema) {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      'Suggestion feature not configured: set VITE_OPENROUTER_API_KEY in .env.local ' +
      '(get a key at https://openrouter.ai/keys).'
    );
  }
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://github.com',
      'X-Title': 'Workflow Router',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 6000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter request failed: ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned no content.');
  return JSON.parse(content);
}

const SUGGEST_SYSTEM_PROMPT =
  'You are helping extend a workflow-ontology graph -- each node is a real business step ' +
  '(a tool, a dataset, or a manual action) and each edge is a real, weighted connection ' +
  'between two steps. You will be given one asset (a tool/skill/service) and the FULL ' +
  'current graph (nodes with producesType/acceptsTypes/assumes, edges with real cost weights).\n\n' +
  'Your job: propose exactly ONE new node representing how this asset could be used as a real ' +
  'step in this workflow, plus one or more edges connecting it to EXISTING compatible nodes ' +
  '(match by producesType/acceptsTypes -- a proposed edge\'s source producesType must appear ' +
  'in the target\'s acceptsTypes, or vice versa depending on direction).\n\n' +
  'GROUNDING RULE -- do not invent a plausible-sounding connection the asset\'s own stated ' +
  'purpose doesn\'t support. Use the asset\'s description/notes as your source of truth for ' +
  'what it actually produces. If you cannot find any node in the graph whose acceptsTypes is ' +
  'compatible with what this asset would plausibly produce, say so honestly in the rationale ' +
  'and still return your best-guess node/edges, but flag low confidence in the rationale text ' +
  '-- never silently force a connection that doesn\'t really fit.\n\n' +
  'Estimate the new edge\'s weight by analogy to structurally similar existing edges in the ' +
  'graph (a well-worn, cheap, well-evidenced step should get a low weight like existing edges ' +
  'around 0.1-0.3; a novel, unproven, or effortful step should get a higher weight like ' +
  'existing edges around 1-3) -- never assert a new connection is costless.\n\n' +
  'Return ONLY the JSON object matching the provided schema, no surrounding text.';

const SUGGEST_SCHEMA = {
  type: 'object',
  properties: {
    node: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'short kebab-case id, must not collide with any existing node id in the graph' },
        label: { type: 'string' },
        type: { type: 'string', enum: ['tool', 'dataset', 'manual'] },
        producesType: { type: 'string', description: 'must be an existing type id already used elsewhere in the graph\'s producesType/acceptsTypes fields, or a sensible new one if truly nothing fits' },
        acceptsTypes: { type: 'array', items: { type: 'string' } },
        assumes: { type: 'array', items: { type: 'string' }, description: '1-3 short factual notes grounded in the asset\'s real description, same style as existing nodes\' assumes text' },
      },
      required: ['id', 'label', 'type', 'producesType', 'acceptsTypes', 'assumes'],
      additionalProperties: false,
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: { source: { type: 'string' }, target: { type: 'string' }, weight: { type: 'number' } },
        required: ['source', 'target', 'weight'],
        additionalProperties: false,
      },
    },
    rationale: { type: 'string', description: 'short plain-language explanation, including an honest confidence caveat if the fit is weak' },
  },
  required: ['node', 'edges', 'rationale'],
  additionalProperties: false,
};

// asset: the FULL resource object from data/resources.json (not just its id).
// graph: the currently-loaded graph object ({ nodes, edges }), including
//   each node's producesType/acceptsTypes (data/semantic-types.json) so the
//   model can ground its proposal in real compatibility, not guess.
// Returns { node, edges, rationale } -- see SUGGEST_SCHEMA above for shape.
// The caller renders this as a distinct "proposed" overlay and never merges
// it into the real graph automatically (App.jsx's handleAcceptSuggestion
// does that only on explicit user confirmation).
export async function suggestPath(asset, graph, { provider = 'openrouter' } = {}) {
  if (provider === 'openrouter') {
    const userPrompt = `ASSET:\n${JSON.stringify(asset, null, 2)}\n\nCURRENT GRAPH:\n${JSON.stringify(graph, null, 2)}`;
    return callOpenRouter(SUGGEST_SYSTEM_PROMPT, userPrompt, 'workflow_suggestion', SUGGEST_SCHEMA);
  }

  // Extension seam -- not implemented. A future branch here could route
  // through n8n instead (keeping the LLM call server-side), call a
  // different provider directly, or hand off to an agent runtime.
  throw new Error(`Unknown or not-yet-implemented suggestion provider: "${provider}"`);
}

const PROPOSE_SYSTEM_PROMPT =
  'You are helping propose a new workflow -- a small connected subgraph of new nodes and edges ' +
  '-- that would advance a stated business goal, built from a business\'s already-catalogued ' +
  'real assets and grounded against its already-documented real workflows.\n\n' +
  'You will be given: GOAL (a plain-language business objective), ASSETS (the full registry of ' +
  'every available tool/skill/service -- id, name, category, vendor, description, notes), and ' +
  'GRAPHS (every existing workflow graph, keyed by filename, each with real nodes carrying ' +
  'producesType/acceptsTypes/assumes and real edges carrying real cost weights).\n\n' +
  'Your job, in order:\n' +
  '1. Pick exactly ONE graphFile from GRAPHS -- whichever graph\'s existing nodes make the most ' +
  'sensible anchor for this goal. The entire proposal attaches to this one graph only.\n' +
  '2. Propose one or more NEW nodes that would combine to advance the goal, each built from a ' +
  'specific real asset in ASSETS wherever one fits (reference which asset by using its real ' +
  'capability, not just its name).\n' +
  '3. Propose edges: connect the new nodes to each other where they form a real sequence, AND ' +
  'connect at least one new node to an EXISTING node already in the chosen graphFile, so the ' +
  'proposal attaches to real practice rather than floating disconnected from everything already ' +
  'there. Match producesType/acceptsTypes the same way existing edges in that graph do.\n\n' +
  'GROUNDING RULE -- base every new node\'s stated purpose strictly on the real asset\'s ' +
  'description/notes. Do not invent a capability an asset doesn\'t actually have. If nothing in ' +
  'ASSETS cleanly fits a step the goal seems to need, you may propose a manual-type node ' +
  'instead, but say so honestly.\n\n' +
  'CROSS-GRAPH RULE -- every edge\'s source and target must both be either one of your proposed ' +
  'new nodes or an existing node already inside the ONE graphFile you picked. Never target a ' +
  'node that lives in a different graph file; the current data model has no way to represent ' +
  'that and such an edge would be silently unusable.\n\n' +
  'Estimate each new edge\'s weight by analogy to structurally similar existing edges within the ' +
  'chosen graph (a well-worn, cheap, well-evidenced step should get a low weight like existing ' +
  'edges around 0.1-0.3; a novel, unproven, or effortful step should get a higher weight like ' +
  'existing edges around 1-3) -- never assert a new connection is costless.\n\n' +
  'Return ONLY the JSON object matching the provided schema, no surrounding text.';

const PROPOSE_SCHEMA = {
  type: 'object',
  properties: {
    graphFile: { type: 'string', description: 'must be exactly one of the keys of the GRAPHS object given -- the single graph this whole proposal attaches to' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'short kebab-case id, must not collide with any existing node id in the chosen graph or with any other proposed node id' },
          label: { type: 'string' },
          type: { type: 'string', enum: ['tool', 'dataset', 'manual'] },
          producesType: { type: 'string', description: 'must be an existing type id already used elsewhere in the chosen graph\'s producesType/acceptsTypes fields, or a sensible new one if truly nothing fits' },
          acceptsTypes: { type: 'array', items: { type: 'string' } },
          assumes: { type: 'array', items: { type: 'string' }, description: '1-3 short factual notes grounded in the real asset\'s description, same style as existing nodes\' assumes text' },
        },
        required: ['id', 'label', 'type', 'producesType', 'acceptsTypes', 'assumes'],
        additionalProperties: false,
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: { source: { type: 'string' }, target: { type: 'string' }, weight: { type: 'number' } },
        required: ['source', 'target', 'weight'],
        additionalProperties: false,
      },
    },
    rationale: { type: 'string', description: 'short plain-language explanation of the whole proposed workflow and how it serves the stated goal, including an honest confidence caveat for any weak part of the fit' },
  },
  required: ['graphFile', 'nodes', 'edges', 'rationale'],
  additionalProperties: false,
};

// goal: plain-language business objective, typed by the user.
// assets: the full resources.json array (every registered asset, not just one).
// graphsByFile: { [graphFile]: { nodes, edges } } for every graph file the
//   app knows about (see /api/graphs) -- lets the model ground its proposal
//   in every workflow's real weights/producesType/acceptsTypes, and pick
//   which ONE graph the proposed subgraph should attach to.
// Returns { graphFile, nodes, edges, rationale } -- see PROPOSE_SCHEMA above.
// Cross-graph edges are explicitly out of scope -- every edge must resolve
// within the single chosen graphFile.
export async function proposeFromGoal(goal, assets, graphsByFile, { provider = 'openrouter' } = {}) {
  if (provider === 'openrouter') {
    const userPrompt = `GOAL:\n${goal}\n\nASSETS:\n${JSON.stringify(assets, null, 2)}\n\nGRAPHS:\n${JSON.stringify(graphsByFile, null, 2)}`;
    return callOpenRouter(PROPOSE_SYSTEM_PROMPT, userPrompt, 'workflow_goal_proposal', PROPOSE_SCHEMA);
  }

  throw new Error(`Unknown or not-yet-implemented suggestion provider: "${provider}"`);
}
