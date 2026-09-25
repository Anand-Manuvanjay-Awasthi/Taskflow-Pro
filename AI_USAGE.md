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
