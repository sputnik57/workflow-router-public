# User Guide

Practical, step-by-step guidance for using and extending this tool on your
own business — distinct from `README.md` (what the app is, feature list)
and the inline `_guide`/`_comment`-style fields in individual `data/*.json`
files (mechanical schema notes for whoever's directly editing that file).
This doc is where the actual *methodology* — the judgment calls, not just
the schema — lives, one section per capability.

---

## How This App Manages Business Workflows

*A note on "manages" as used in this doc:* it means the common software
sense — tracks, routes, organizes, finds paths through. It does not mean
the app acts or decides on its own; that responsibility always sits with
a human.

Before any of this works, the workflow itself has to exist as a real
graph — see "Building or Extending a Real Workflow Graph" below for how.
That's necessary infrastructure, not the app's purpose; here's what it
actually does once that's in place.

**1. Finds the actual fastest path to a business outcome.** Given a
starting point and a goal, it computes the real lowest-cost route
through already-practiced steps — not a guess, a calculation on real
weights that can be input by the user. Those weights don't have to be an
abstract friction score; they can be actual people-hours, actual dollar
cost, or any other concrete metric that matters for the decision. Useful
for a concrete question like "what's the fastest way to turn a cold lead
into a paying client," answered from real numbers instead of intuition.

**2. Proposes a novel use for one asset you choose.** Pick a single owned
asset — used or not — and get a proposed new connection into the
*currently-loaded* workflow: a genuinely new node and edge, not already
in the graph, with reasoning for why it fits. Different from an
inventory (no proposal) and from the portfolio scan below (which
searches the whole registry unprompted, not one asset you picked). How
good its proposals are depends entirely on how well-curated your own
graph data is — this feature can't invent knowledge of your business it
wasn't given.

**3. Proposes whole new workflows from a stated goal.** Surveys every
asset and every graph at once and proposes a connected path answering a
stated business question with no starting asset in mind — the literal
original question that motivated this whole feature set: "I have these
tools, how do I make money from them?" Same caveat as above: its real
value scales with real curated data.

**4. Audits what's sitting idle.** Reports which owned assets are never
referenced anywhere, and which are wired in but lead nowhere. Making its
results trustworthy requires manually confirming which real asset each
workflow step actually uses — the gaps get filled through use, the same
way the graph itself gets built.

---

## Semantic Type Vocabulary

This is the single most important capability in this tool. Everything else
(the graph, the Node dropdown, Quick-start) is a map of steps you already
know. This is what lets the app reason about steps that *don't exist yet* —
whether a new asset could plausibly connect somewhere in your workflow. Get
this part right and the suggestion feature (Phase 3+) has real substance to
work with. Get it wrong (too coarse, too fine, or guessed instead of
grounded) and it produces noise that looks like insight.

### What it is, concretely

Every node in a graph already has `inputs`/`outputs` — but those are just
IDs of already-connected neighbor nodes, not a description of *what kind*
of thing flows through. That's fine for display, useless for reasoning
about a brand-new hypothetical connection, since there's no existing edge
to look up.

The fix: a small, separate, closed vocabulary of semantic types
(`data/semantic-types.json`), and two new fields per node:

- `producesType` — the one kind of thing this node outputs
- `acceptsTypes` — the kind(s) of thing this node can take as input

A proposed connection is checked by asking: does the source's
`producesType` appear in the target's `acceptsTypes`? See
`src/lib/compatibility.js` for the actual check.

### How to build one from scratch, step by step

**1. Read every node in every graph you're typing, in full — labels,
`assumes` text, everything.** You cannot assign types accurately from node
IDs alone. The `assumes` text is where the real substance usually lives.

**2. Draft a small, closed vocabulary first — don't type node-by-node and
let the vocabulary grow organically.** Target roughly 15-25 types across
an entire multi-graph system, not one type per node. If you're reaching
for a new type, ask first whether an existing one already covers it
closely enough. Reuse across graphs is the actual point — it's what would
let a future feature reason across previously-siloed workflows instead of
one graph at a time.

**3. Every vocabulary entry is an `{id, description}` pair, never a bare
label.** The `id` is a short technical string for exact-match code logic.
The `description` is a compact, plain-language fragment — not a full
grammatical sentence, not a cryptic abbreviation either. Worked example
from this project's own vocabulary:

```json
{ "id": "lead-record", "description": "A specific prospect business, with enough info to contact them, at any pipeline stage" }
```

Bad version (too cryptic, no context): `"lead-record"` alone with no
description. Also bad (too verbose): "A record in our system that
represents a business we have identified as a potential sales prospect
and have..." — say it in a fragment, not an essay.

**4. For anything representing a real external tool/vendor, ground the
type in their own stated purpose — don't guess from the product name.**
Pull their actual one-liner and feature list (a web search is enough) and
let *their* words decide what it produces, including distinctions you
wouldn't have assumed. Worked example, from the example graph shipped
with this app: Canva sounds like it might handle client communication,
but its own product copy says it's a design tool for graphics and
presentations — it produces a `draft-deliverable`, not client-facing
messages. Skipping this step and guessing from the name alone would have
missed that distinction.

**5. Assign `producesType`/`acceptsTypes` to every node**, reusing
vocabulary entries deliberately wherever the same real kind of thing is
genuinely involved, rather than minting a near-duplicate type for every
new node.

**6. Flag what you're not confident about instead of guessing.** If you
haven't actually used a tool/skill yet and don't know precisely what it
produces, say so explicitly in the vocabulary entry (a `notes` field) and
pick the coarsest defensible type rather than inventing false precision.

**7. Validate before trusting it — check three things:**
   - Every type in the vocabulary is actually used by at least one node
     (an unused type usually means it was too specific/one-off — reconsider
     whether it should have been merged into something else)
   - Every `producesType`/`acceptsTypes` value on every node matches a
     real vocabulary `id` (catches typos — a silent mismatch here means a
     compatibility check will just always return false and nobody notices)
   - Run the actual compatibility function against one known-good pair
     (two nodes you know should connect) and one known-bad pair (two that
     obviously shouldn't) and confirm it gives the right answer for both

**8. Treat it as revisable, not locked in on the first pass.** The first
draft is exactly that — a draft for the person who actually knows the
business to react to and correct.

### Where this app's own vocabulary lives

`data/semantic-types.json` — the 10 types backing the example graph
shipped with this app. Read it directly for a complete worked example
rather than a hypothetical one.

---

## Building or Extending a Real Workflow Graph

The process below is the actual discipline behind how the example graph
shipped with this app (`data/graph.json`) was built — apply the same
steps to your own business, not a hypothetical best-practice list.

**1. Ground every new node in a real source, read in full, before writing
anything.** Don't infer a step from a label or a half-remembered process
description. If a step has a real SOP or checklist somewhere, read that
file start to finish before writing the node — that's where the real
structure (how many touches, what triggers a human review) actually
comes from, not a guess at what the step "probably" involves.

**2. Check what already exists before adding anything.** Grep/read the
target graph's current nodes first — new work should extend or correct
what's there, not silently duplicate it. This matters just as much when
an LLM proposes a new node via the suggestion feature — nothing stops it
from proposing a node that duplicates one that already exists unless you
check.

**3. Propose the structure in plain text before writing to the file, and
expect it to be wrong the first time.** Sketch the nodes and edges in
prose, and let the person who actually knows the business react before
anything gets written to JSON. Wrong graph, wrong status, wrong scope,
and conflating two genuinely different steps are all easy mistakes that
are cheap to catch in a sentence and expensive to catch after they're
already encoded as data.

**4. Decide whether it's an extension or a new graph — the real signal is
whether the downstream steps actually diverge, not graph size.** When a
product or process's real path (different audience, different mechanics,
different people involved) genuinely doesn't share shape with what's
already in a graph, split it into its own graph rather than forcing a
denser corner of the existing one — a "hairball" is a real cost, not
just an aesthetic one.

**5. If a new graph has to duplicate steps from an existing one, do it
deliberately and say so in the `assumes` text.** No cross-graph edges
exist in this tool yet — a workflow that genuinely spans two graphs has
no way to reference a node it doesn't own. If a second graph needs a
node that's really a copy of one in another graph, say so explicitly in
that node's `assumes` text, so a future reader isn't left wondering
whether the duplication was intentional or a copy-paste mistake.

**6. Assign `producesType`/`acceptsTypes` using the existing vocabulary
first — don't invent new types for a coarse pass.** Every edge in a new
chain should be checkable, not just plausible-looking. Reusing an
existing type where it genuinely fits is normal and expected, per the
vocabulary methodology above — it's not a sign the pass was too coarse.

**7. Mark real gaps honestly, and back the claim with actual evidence, not
assumption.** Before marking a node `status: "not-built"`, check whether
it's really missing or just informally practiced somewhere that hasn't
been written down yet.

**8. Validate after every edit, before calling it done — four checks, not
one:**
   - The file is valid JSON
   - Every `inputs`/`outputs`/`resourceId` value on every node resolves to
     a real node/resource id (a broken reference here fails silently
     otherwise)
   - Every edge passes the actual `edgeCompatible()` check from
     `src/lib/compatibility.js` — type-clean by construction, not by eye
   - The file actually serves through the running dev server (a quick
     `curl` against the app/data path), since a valid file can still be
     misplaced or excluded by `vite.config.js`'s file-listing rules

**9. Write commit messages that carry the reasoning, not just the diff.**
A future reader needs to know *why* a node was scoped the way it was, not
just that it was added — that context is expensive to reconstruct later
and cheap to write down once, at commit time.

---

## UI Reference — every control, one line each

Written 2026-09-14 because the app grew enough real controls, across
enough features, that even the person who built them started losing
track. Organized by where each thing actually sits on screen, not by
which phase built it — read top to bottom the way your eye would move
down the page.

### Top bar

- **Workflow dropdown** — switch which graph file is loaded (the example
  graph, plus any Exploration graphs you've created).
- **Node dropdown** — pick a goal node directly, the technical/manual
  alternative to Quick-start below.
- **Light / Dark** — theme toggle.

### Quick-start — "Ask a business question" dropdown

- **Pick a question…** — placeholder/default.
- **Suggest a new path using an asset…** — opens an asset picker (a second
  dropdown + **Suggest**/**Suggesting…** button + **Cancel**). Proposes one
  new node + edge(s) for the chosen asset within the current graph.
- **Propose a new workflow for a business goal…** — the goal-first
  feature. Opens a text field + **Propose**/**Proposing…** button +
  **Cancel**. Surveys every asset and every graph at once; accepting
  creates a whole new standalone Exploration graph rather than merging
  into the current one.
- *(separator)*
- **Curated questions** — hand-authored, pre-verified start→goal pairs.

### Suggestion/proposal review bar (appears above the canvas only when one is pending)

- **Accept into graph** — commits the proposed node(s)/edge(s) for real,
  tagged `suggested` so they show up in Admin → Explorations later.
- **Discard** — drops the proposal, nothing written.

### Canvas area

- **Reset layout** / **Save layout** — a small floating control panel in
  the canvas's top-right corner. Reset recomputes node positions from
  scratch (auto-layout), discarding any manual dragging; Save persists
  current node positions back to the graph file.
- **Click a node** — select it for the sidebar detail panel.
- **Drag a node** — reposition it (not saved until you click Save layout).
- **Sidebar** — condition toggles, node-type filters, text search.

### Below the canvas — path selection

- **GoalPanel** (ranked node list) — click one to set the start point,
  once a goal is already chosen.
- **Path cards** ("Lowest-cost path," "Alternative 2," ...) — click to
  choose which computed route is active, when more than one exists.

### Admin → Brand

- **Light / Dark** — this page's own separate theme toggle, scoped to
  previewing this tab only.
- **Open source style guide** / **Open globals.css** — only shown if
  `data/brand.json`'s `sourcePath`/`cssSourcePath` are set; opens that
  file in your editor (`~/`-prefixed paths only).

### Admin → Asset management

- **+ Add asset** / **Delete asset** — both currently disabled
  ("coming soon").
- **Scan for idle assets** / **Scanning…** — the portfolio scan. Reports
  registered assets never linked via `resourceId` anywhere, and ones
  linked but with no compatible downstream consumer. Ships with an
  accuracy caveat — trustworthy results depend on real `resourceId`
  coverage across your graph.
- Asset browser below — informational browsing + highlight-in-graph only,
  no other actions here by design.

### Admin → Workflow management

- **Workflow list** — click one to target it for the CSV/JSON tools below.
- **CSV file picker** + **Export current graph as CSV** — bulk edit via
  spreadsheet instead of one node/edge at a time.
- **Raw-JSON textarea** + **Apply changes** — direct edit of the targeted
  graph's full nodes/edges.

### Admin → Explorations

- **Exploration workflows** section — **Open** (switches the main canvas
  to that graph) / **Delete** (removes the whole file — server-side
  restricted to files with `meta.isExploration`).
- **Exploration nodes** section — same idea as the section above, at node
  scale instead of whole-graph scale. Always follows whichever graph is
  currently open on screen, independent of the section above it — see the
  "Currently viewing: X" badge. **Open / Close** toggles a node's
  rationale text (collapsed by default so the list stays scannable);
  **Delete** removes that node and its connecting edge(s) permanently.
