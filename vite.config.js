import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseNodesCsv, parseEdgesCsv, nodesToCsv, edgesToCsv, mergeGraph } from './src/lib/csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const RESOURCES_PATH = path.join(DATA_DIR, 'resources.json');
const BRAND_PATH = path.join(DATA_DIR, 'brand.json');
const QUICK_START_PATH = path.join(DATA_DIR, 'quick-start.json');
const DEFAULT_GRAPH = 'graph.json';

// data/ holds workflow graphs alongside non-graph JSON (resources, brand,
// quick-start scenarios) -- this list is the single place excluding the
// latter from being treated as an openable graph file, so a new non-graph
// file only needs adding here, not at every call site.
const NON_GRAPH_FILES = new Set(['resources.json', 'brand.json', 'quick-start.json', 'semantic-types.json']);

// Multiple workflow graphs can live side by side in data/ (content, sales, ...).
// Only a bare filename matching this pattern is ever accepted from a request --
// no path traversal, and non-graph files are excluded so they can't be opened as a graph.
function graphPathFor(name) {
  const safe = /^[a-z0-9-]+\.json$/.test(name || '') && !NON_GRAPH_FILES.has(name) ? name : DEFAULT_GRAPH;
  return path.join(DATA_DIR, safe);
}

function listGraphs() {
  return fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json') && !NON_GRAPH_FILES.has(f))
    .sort();
}

function readGraph(name) {
  return JSON.parse(fs.readFileSync(graphPathFor(name), 'utf-8'));
}

// Goal-proposal exploration graphs (self-contained files created by
// App.jsx's handleAcceptGoalProposal, one per business-goal query) carry a
// meta.isExploration flag so Admin > Explorations can list and whole-file
// delete them without treating every hand-authored workflow the same way --
// listGraphsWithMeta() reads that flag cheaply alongside the filename list so
// the client doesn't need a separate fetch per file just to tell which are
// which.
function listGraphsWithMeta() {
  return listGraphs().map((file) => {
    let meta = null;
    try {
      meta = readGraph(file)?.meta || null;
    } catch {
      meta = null;
    }
    return { file, meta };
  });
}

function readResources() {
  return JSON.parse(fs.readFileSync(RESOURCES_PATH, 'utf-8'));
}

function readBrand() {
  return JSON.parse(fs.readFileSync(BRAND_PATH, 'utf-8'));
}

function readQuickStart() {
  return JSON.parse(fs.readFileSync(QUICK_START_PATH, 'utf-8'));
}

function writeGraph(name, graph) {
  fs.writeFileSync(graphPathFor(name), JSON.stringify(graph, null, 2) + '\n');
}

// Which editor CLI is on PATH varies per machine (desktop VS Code's `code`,
// code-server's `code-server`, Cursor's `cursor`, ...). Hardcoding one only
// works on the machine that happened to build this -- anyone else running the
// app would just get a bare ENOENT with no path forward. Try common ones in
// order, plus a WORKFLOW_ROUTER_EDITOR_CMD override for anything else.
const EDITOR_CANDIDATES = [
  process.env.WORKFLOW_ROUTER_EDITOR_CMD,
  'code', 'code-server', 'cursor', 'codium', 'windsurf',
].filter(Boolean);

function tryOpen(cmd, resolvedPath) {
  return new Promise((resolve, reject) => {
    execFile(cmd, [resolvedPath], (err) => (err ? reject(err) : resolve()));
  });
}

// Resource paths that start with ~/ are the only ones this ever opens -- that's
// every real Claude-skill entry in the registry. Anything else (env var names,
// plugin: refs, dashboard routes) is rejected rather than guessed at. Uses
// execFile with an argv array (not a shell string) so nothing in the path can be
// interpreted as a shell command, even though this only ever runs against
// trusted local registry data.
async function openInEditor(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.startsWith('~/')) {
    throw new Error('Only ~/-prefixed paths can be opened.');
  }
  const resolved = path.join(os.homedir(), rawPath.slice(2));

  let lastErr;
  for (const cmd of EDITOR_CANDIDATES) {
    try {
      await tryOpen(cmd, resolved);
      return;
    } catch (err) {
      lastErr = err;
      if (err.code !== 'ENOENT') throw err; // found the binary, it genuinely failed -- don't mask that by trying the next one
    }
  }
  throw new Error(
    `No supported editor CLI found on PATH (tried: ${EDITOR_CANDIDATES.join(', ')}). ` +
    `Set WORKFLOW_ROUTER_EDITOR_CMD to your editor's CLI command and restart the dev server.`
  );
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

// LLM proxy for the suggestion features -- runs server-side (this dev-server
// process) so your API key lives in a plain (non-VITE_-prefixed) env var and
// never gets bundled into client JS, and so an Anthropic call doesn't hit
// browser CORS restrictions. The client (src/lib/suggest.js) only ever posts
// { systemPrompt, userPrompt, schemaName, schema } here and gets back the
// parsed JSON result -- it never talks to a provider directly.
// Supports Anthropic, OpenAI, or OpenRouter -- set whichever one you
// actually have a key for in .env.local. If more than one key is set, order
// of preference is Anthropic > OpenAI > OpenRouter unless LLM_PROVIDER
// explicitly names one ("anthropic" | "openai" | "openrouter").
async function callAnthropic(apiKey, model, systemPrompt, userPrompt, schemaName, schema) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 6000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [{ name: schemaName, description: 'Return the proposal matching this schema.', input_schema: schema }],
      tool_choice: { type: 'tool', name: schemaName },
    }),
  });
  if (!res.ok) throw new Error(`Anthropic request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const toolUse = data.content?.find((c) => c.type === 'tool_use');
  if (!toolUse) throw new Error('Anthropic returned no tool_use block.');
  return toolUse.input;
}

async function callOpenRouter(apiKey, model, systemPrompt, userPrompt, schemaName, schema) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com',
      'X-Title': 'Workflow Router',
    },
    body: JSON.stringify({
      model,
      max_tokens: 6000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned no content.');
  return JSON.parse(content);
}

async function callOpenAI(apiKey, model, systemPrompt, userPrompt, schemaName, schema) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 6000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content.');
  return JSON.parse(content);
}

const PROVIDERS = {
  anthropic: {
    key: () => process.env.ANTHROPIC_API_KEY,
    call: (key, systemPrompt, userPrompt, schemaName, schema) =>
      callAnthropic(key, process.env.ANTHROPIC_MODEL || 'claude-opus-5', systemPrompt, userPrompt, schemaName, schema),
  },
  openai: {
    key: () => process.env.OPENAI_API_KEY,
    call: (key, systemPrompt, userPrompt, schemaName, schema) =>
      callOpenAI(key, process.env.OPENAI_MODEL || 'gpt-5', systemPrompt, userPrompt, schemaName, schema),
  },
  openrouter: {
    key: () => process.env.OPENROUTER_API_KEY,
    call: (key, systemPrompt, userPrompt, schemaName, schema) =>
      callOpenRouter(key, process.env.OPENROUTER_MODEL || 'anthropic/claude-opus-5', systemPrompt, userPrompt, schemaName, schema),
  },
};

async function callLlm(systemPrompt, userPrompt, schemaName, schema) {
  const forced = process.env.LLM_PROVIDER;
  const order = forced && PROVIDERS[forced] ? [forced] : ['anthropic', 'openai', 'openrouter'];
  for (const name of order) {
    const key = PROVIDERS[name].key();
    if (key) return PROVIDERS[name].call(key, systemPrompt, userPrompt, schemaName, schema);
  }
  throw new Error(
    'Suggestion feature not configured: set one of ANTHROPIC_API_KEY, OPENAI_API_KEY, or ' +
    'OPENROUTER_API_KEY in .env.local (plain env vars, not VITE_-prefixed -- these stay ' +
    'server-side, never bundled into client JS).'
  );
}

// Small dev-server middleware plugin: serves the graph JSON API directly inside
// the same `vite dev` process, so no separate backend/port is needed.
function graphApiPlugin() {
  return {
    name: 'graph-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');

        if (url.pathname === '/api/resources' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            res.end(JSON.stringify(readResources()));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }
        if (url.pathname === '/api/quick-start' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            res.end(JSON.stringify(readQuickStart()));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }
        if (url.pathname === '/api/brand' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            res.end(JSON.stringify(readBrand()));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }
        if (url.pathname === '/api/open' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { path: rawPath } = await readJsonBody(req);
            await openInEditor(rawPath);
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }
        if (url.pathname === '/api/graphs' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            res.end(JSON.stringify({ files: listGraphs(), graphs: listGraphsWithMeta() }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }
        if (url.pathname === '/api/llm-suggest' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { systemPrompt, userPrompt, schemaName, schema } = await readJsonBody(req);
            const result = await callLlm(systemPrompt, userPrompt, schemaName, schema);
            res.end(JSON.stringify(result));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }
        if (!url.pathname.startsWith('/api/graph')) return next();
        res.setHeader('Content-Type', 'application/json');
        const graphName = url.searchParams.get('file');

        try {
          if (url.pathname === '/api/graph' && req.method === 'GET') {
            res.end(JSON.stringify(readGraph(graphName)));
            return;
          }
          if (url.pathname === '/api/graph' && req.method === 'PUT') {
            const graph = await readJsonBody(req);
            writeGraph(graphName, graph);
            res.end(JSON.stringify(graph));
            return;
          }
          // Whole-file delete, deliberately restricted to exploration graphs
          // (meta.isExploration, set only by handleAcceptGoalProposal) -- the
          // hand-authored workflows (Sales, Marketing, Content, ...) have no
          // UI path that could call this, but the server-side check is what
          // actually prevents a mistaken/malicious request from deleting one.
          if (url.pathname === '/api/graph' && req.method === 'DELETE') {
            let existing = null;
            try { existing = readGraph(graphName); } catch { existing = null; }
            if (!existing?.meta?.isExploration) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: 'Only exploration graphs (meta.isExploration) can be deleted.' }));
              return;
            }
            fs.unlinkSync(graphPathFor(graphName));
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (url.pathname === '/api/graph/import-csv' && req.method === 'POST') {
            const { nodesCsv, edgesCsv } = await readJsonBody(req);
            const parsedNodes = nodesCsv ? parseNodesCsv(nodesCsv) : [];
            const parsedEdges = edgesCsv ? parseEdgesCsv(edgesCsv) : [];
            const merged = mergeGraph(readGraph(graphName), { nodes: parsedNodes, edges: parsedEdges });
            writeGraph(graphName, merged);
            res.end(JSON.stringify(merged));
            return;
          }
          if (url.pathname === '/api/graph/export-csv' && req.method === 'GET') {
            const graph = readGraph(graphName);
            res.end(JSON.stringify({
              nodesCsv: nodesToCsv(graph.nodes),
              edgesCsv: edgesToCsv(graph.edges),
            }));
            return;
          }
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

// Vite only auto-loads VITE_-prefixed vars into import.meta.env for the
// CLIENT bundle -- plain vars like ANTHROPIC_API_KEY are never bundled
// (that's the whole point), but they also don't reach this config file's
// own process.env automatically. loadEnv() with an empty prefix reads
// .env.local's full contents so callLlm() above can actually see them.
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [react(), graphApiPlugin()],
  };
});
