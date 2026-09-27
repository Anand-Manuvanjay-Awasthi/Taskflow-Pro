# TaskFlow Pro

A DAG-based Kanban platform with an agentic AI layer, built for a hackathon "Build" submission.
Tasks are nodes, dependencies are directed edges, and Ready/Blocked is always a **computed**
property — never set by hand. An AI agent gets tool access to the graph to suggest dependencies,
investigate schedule impact before anything is committed, and detect drift between what task
descriptions say and what the graph actually contains.

## Architecture

```
Kanban UI (React) → Workflow API (Express) → Workflow Service → DAG Engine → SQLite
                                                     ↑
                     AI Agent (Anthropic API) → Tool Layer ┘
```

`WorkflowService` (`server/src/api/workflow.ts`) is the **single authoritative entry point** for
every graph mutation. The HTTP router and the AI tool layer both call through it — neither has
direct access to the database or the DAG algorithms — so cycle checks, validation, and schedule
propagation can never be bypassed, including by the AI agent. The agent's tools are read-only
except for the human-reviewed "confirm suggestion" action, which goes through the normal
`POST /api/dependencies` endpoint like a manual link would.

- **DAG engine** (`server/src/dag/`): cycle rejection, Ready/Blocked computation (scoped to
  affected descendants only, not a full-graph recompute), schedule propagation with **no
  compounding** across diamond dependencies (a node's net shift is the max across incoming
  affected paths, not the sum), and rollback propagation.
- **Workflow API** (`server/src/api/`): Express + Zod-validated endpoints; clear 4xx errors for
  bad input instead of 500s or silent no-ops.
- **AI tool layer** (`server/src/ai/tools.ts`): thin, unit-tested wrappers over `WorkflowService`
  that the LLM calls as tools.
- **AI capabilities** (`server/src/ai/`):
  1. `suggestDependencies.ts` — baseline dependency suggestion, structured JSON output.
  2. `impactInvestigator.ts` — Pre-Commit Impact Investigator, a bounded tool-calling agent loop
     that must call `simulateScheduleChange()` (a real, read-only run of the scheduling engine)
     rather than estimating impact itself.
  3. `driftDetector.ts` — Semantic-Structural Drift Detector, compares task-description language
     against persisted edges.

  All three validate LLM output against a schema, retry once (feeding the parse error back to the
  model) on malformed output, and fall back to a clear "unavailable" message rather than crashing.

## Setup & run

Requires Node.js 20+.

```bash
# 1. Server
cd server
npm install
cp .env.example .env        # add your ANTHROPIC_API_KEY for the AI features (Kanban/DAG works without it)
npm run dev                 # http://localhost:3001

# 2. Client (separate terminal)
cd client
npm install
npm run dev                 # http://localhost:5173, proxies /api to :3001
```

SQLite is used for the hackathon build (zero external infra, trivially reproducible); the DB file
is created automatically at `server/data/taskflow.db` (gitignored). **Postgres is the intended
production target** — swapping the `better-sqlite3` calls in `server/src/db/` for a Postgres
client is the main integration point; the DAG engine and Workflow API are storage-agnostic.

## Testing

```bash
cd server
npm test
```

38 tests across the DAG engine, the Workflow API (integration), the AI tool layer, and all three
AI capabilities (with a fake Anthropic client so tests never make real network calls). Coverage
includes the named edge cases: cycle rejection (direct, longer, self-reference), the diamond
dependency no-compounding case (explicit assertion that a converging node shifts by `max(3,3)=3`,
not `3+3=6`), and Done → In Progress rollback re-blocking downstream tasks.

## Demo flow

1. Create a few tasks, optionally with descriptions like "blocked by the database setup".
2. Use **Dependency suggestions** in the sidebar — review and confirm (or reject) what the AI
   proposes; a cyclic suggestion is flagged, not silently offered.
3. Watch Ready/Blocked update as you move tasks through columns.
4. Shift an upstream task's schedule (Schedule panel) and watch a diamond-shaped downstream task
   move by the shared max, not a doubled amount.
5. Ask the **Impact investigator** a what-if question ("what happens if X slips N days?") and see
   it explain a result it actually computed via the scheduling engine, plus which tools it called.
6. Move a Done task back to In Progress and watch its dependents re-block.
7. Run the **Drift detector** to surface a description/graph mismatch.

## Known limitations

- Dependency and drift suggestions are heuristic and require human confirmation; they are not
  always correct (see `AI_USAGE.md`).
- No auth/multi-user support — single shared board, appropriate for a hackathon demo.
- Critical-path view is a straight longest-path calculation; it does not yet account for resource
  contention or parallel-work limits.
- The Impact Investigator's tool-call loop is bounded (6 rounds) and returns a "did not converge"
  message rather than looping indefinitely on an ambiguous question.

See `AI_USAGE.md` for the AI-assistance and AI-feature disclosure log.
