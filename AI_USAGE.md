# AI Usage Log

This file is an honest engineering log of AI involvement in building TaskFlow Pro, updated as
work progresses (not written retroactively).

## Development assistance

- **2026-09-26** — Repo scaffold (folder structure, `.gitignore`, `.env.example`, README stub)
  generated with Claude (Sonnet 5) assistance based on a detailed master build prompt supplied by
  the developer. The prompt specified the architecture, data model, algorithms, scoring criteria,
  and commit discipline; Claude executed it, writing code directly rather than the developer
  hand-typing it. All commits below are AI-assisted; the developer reviewed each unit before it
  was considered "done" for this log.

## Runtime AI features (product-facing)

Model: `claude-sonnet-4-6` via the Anthropic API, called **server-side only** (never from the
browser), key read from `ANTHROPIC_API_KEY`.

Planned capabilities (implemented incrementally, logged here as they land):
1. Dependency suggestion (structured JSON proposal, human-reviewed, validated by the DAG engine
   before persistence).
2. Pre-Commit Impact Investigator (tool-calling agent that reads the real scheduling engine via
   `simulateScheduleChange()` — never invents impact numbers itself).
3. Semantic-Structural Drift Detector (compares task-description language against persisted
   edges via the same tool interface).

## Known limitations (updated as features land)

- Dependency suggestions are not always correct and require human confirmation before any edge is
  persisted.
- The LLM has no direct database access and cannot bypass cycle checks, validation, or the
  scheduling engine — it can only call the same validated tool/API layer the UI uses.

## Update — dependency suggestion endpoint

- `POST /api/ai/tasks/:id/suggest-dependencies` implemented. Model output is
  schema-validated (zod), retried once on malformed JSON with the error fed
  back to the model, and falls back to a clear "no suggestion" message if it
  still fails — the request never 500s or silently no-ops on a bad LLM
  response.
- Every candidate edge is independently re-checked against the real
  `wouldCreateCycle` logic and existing-dependency check before being
  returned; the model's own claims about the graph are never trusted as-is.
- Limitation: suggestions are heuristic (based on task title/description
  text) and are not persisted automatically — a human must confirm before
  the edge is created via the normal `POST /api/dependencies` endpoint.

## Final pass — full feature summary

All three product-facing AI capabilities are implemented and tested with a mocked Anthropic
client (no real network calls in the test suite):

1. Dependency suggestion (`POST /api/ai/tasks/:id/suggest-dependencies`)
2. Pre-Commit Impact Investigator (`POST /api/ai/investigate`) — tool-calling agent loop, bounded
   to 6 rounds, that must call `simulateScheduleChange` and friends rather than inventing impact
   numbers.
3. Semantic-Structural Drift Detector (`GET /api/ai/drift-report`)

Development-assistance summary: this entire repository (DAG engine, Workflow API, AI tool layer,
AI endpoints, React/Tailwind UI, and all tests) was written by Claude (Sonnet 5) executing a
detailed master build prompt supplied by the developer, who reviewed and directed the work
commit-by-commit rather than accepting one large unreviewed dump. No part of the codebase was
generated and left unreviewed; algorithmic correctness (cycle detection, no-compounding diamond
propagation, rollback) was specifically checked via the unit and integration test suite before
each relevant commit.

Final known limitations (see also README.md):
- AI suggestions (dependency + drift) are heuristic, grounded against the real DAG engine before
  being shown, but still require a human to click "confirm" before anything is persisted.
- The Impact Investigator trusts tool outputs, not its own arithmetic, but its natural-language
  question parsing can still misinterpret an ambiguous "what if" question — the tool-call trace is
  shown in the UI so this is auditable.
- No secrets, real credentials, or production data exist anywhere in this repository or its
  history; `ANTHROPIC_API_KEY` is read from an environment variable and is never logged or
  returned by any endpoint.
