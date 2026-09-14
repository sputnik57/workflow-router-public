# Workflow Router

A tool for turning how you actually run your business — the workflows you
already practice, not a hypothetical org chart — into an explicit,
navigable graph. Each node is a real step (a tool, a dataset, or a manual
action); each edge carries a real cost/friction weight. Pick two points in
that graph and see every path between them, ranked by cost, with the
assumptions each step depends on made visible instead of left tacit.

Built by [teKnoculture](https://teknoculture.com), released free.

## Why this exists

Documenting a workflow accurately takes real, disciplined effort — the
same kind of work as writing a good SOP. Once it's done, the resulting
graph is worth more than the checklist it started as: it's a structured
map of your actual operational reality that can be queried, checked for
consistency, and reasoned over — including by an LLM.

This repo ships with one small, invented example workflow (a freelance
consultant's lead-to-payment process, `data/graph.json`) so you can see
the app work end to end before replacing it with your own.

## Features

- **Path-finding** — pick a start and goal node, see every real path
  between them ranked by cost, with each step's real assumptions shown.
- **Quick-start dropdown** — plain business questions mapped to known
  start→goal pairs (`data/quick-start.json`), kept separate from the
  technical Node dropdown so business phrasing doesn't leak into internal
  node ids.
- **Suggest a path using an asset** — pick one asset from your registry,
  get an LLM-proposed new node/edge showing how it could fit into the
  current workflow, grounded in the asset's real stated purpose. Shown as
  a dashed "proposed" overlay, never merged into your real graph until you
  explicitly accept it.
- **Propose a new workflow for a goal** — same idea at a larger scale:
  state a business goal in plain language, and the app surveys every asset
  and every graph at once to propose a small connected subgraph.
- **Portfolio scan** (Admin → Asset management) — a whole-registry report
  of assets that are never referenced by any workflow step, or that are
  wired in but lead nowhere. No LLM call — pure data check.
- **Admin** — a Brand tab (example data, meant to be replaced with your
  own), an asset registry, and CSV import/export for bulk-editing a whole
  graph in a spreadsheet instead of one node at a time.

## What this is *not*

This is the business-optimization half of a larger internal tool, not the
agent-orchestration half. There's no execution/job-queue layer here — no
"hand this path to an agent and track its progress" feature. That part is
specific to how we run agents internally and isn't something a generic
public download can offer meaningfully, so it's deliberately left out.

## Setup

```bash
npm install
cp .env.example .env.local   # add your own OpenRouter API key
npm run dev
```

The "Suggest a path" and "Propose a new workflow" features call
[OpenRouter](https://openrouter.ai/keys) directly from the browser using
your own API key (`VITE_OPENROUTER_API_KEY` in `.env.local`). That key
gets bundled into the client-side JS — fine for running this locally on
your own machine, but **do not deploy a build of this app to a public
server** with a real key baked in. Everything else works with no key at
all.

Dev server includes a small Node middleware (`vite.config.js`) serving the
graph/resources/quick-start/brand JSON directly from `data/` — no separate
backend needed.

## Using this with your own workflows

1. Replace `data/graph.json` with your own nodes/edges — the fastest way
   to do this well is the same way the example graph was built: describe
   your real process to an LLM-assisted coding session (Claude Code or
   similar) and have it help you draft the graph, the same disciplined way
   you'd write an SOP.
2. Update `data/quick-start.json` with your own business questions — read
   that file's `_guide` field first, it's written for exactly this
   handoff.
3. Update `data/resources.json` with your own actual tools/skills/
   services — this is what the suggestion features reason over, so keep
   it real and current, not aspirational.
4. Replace `data/brand.json` with your own name/voice/positioning (Admin →
   Brand).

See `docs/user-guide.md` for the full semantic-type vocabulary and graph-
building methodology.
