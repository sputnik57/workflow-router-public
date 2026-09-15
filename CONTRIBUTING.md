# Contributing

This is a small, solo-maintained project — see the README's Support section
for what to expect on response time.

## Issues

Bug reports and feature ideas are welcome. Before filing one, please check
it's actually about the app mechanism (graph viewer, path-finding,
suggestions, portfolio scan) and not about the example data shipped with the
repo — the example workflow is intentionally minimal and made up.

## Pull requests

Small, focused PRs are easiest to review and merge. For anything larger,
open an issue first to talk through the approach before writing code.

## Development

```bash
npm install
cp .env.example .env.local   # optional, only needed for the suggestion features
npm run dev
```

See `docs/user-guide.md` for the semantic-type vocabulary and graph-building
methodology behind how the app's data model works.
