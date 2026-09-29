# TaskFlow Pro — System Design Document

**Version:** 1.0  
**Date:** 2026-09-29  
**Scope:** Spring Boot backend, React integration, persistence, DAG semantics, AI design, and operational constraints.

## 1. Purpose and product boundary

TaskFlow Pro is a Kanban workspace for projects where work order matters. It represents tasks as nodes in a directed acyclic graph (DAG), with an edge from a prerequisite to the task that depends on it.

- column is the user-managed Kanban position.
- status is a computed execution signal (ready or blocked); neither the UI nor AI can set it directly.

The product provides safe dependency entry, schedule what-if analysis and application, critical-path calculation, and optional AI-assisted inspection. AI can propose or investigate work, but it cannot mutate the database or bypass graph constraints.

## 2. Runtime architecture

    React / Vite client (localhost:5173)
              |
              | /api proxy
              v
    Spring Boot REST API (localhost:3001)
              |
              +-------------------+---------------------+
              |                   |                     |
              v                   v                     v
    WorkflowController      AiController       ApiExceptionHandler
              |                   |                     |
              +---------> WorkflowService <----- AiService
                                |
                                v
                          GraphAlgorithms
                                |
                                v
                       WorkflowRepository (JDBC)
                                |
                                v
                            SQLite database

    AiService --> AnthropicLlmClient --> Anthropic Messages API (optional)

The frontend preserves the existing JSON contract. It only calls /api, never an LLM provider directly. Vite proxies requests to Spring Boot during local development.

| Package | Responsibility |
| --- | --- |
| com.taskflowpro.web | REST routes, request validation, and uniform API errors. |
| com.taskflowpro.service | Authoritative workflow gateway and transaction boundaries. |
| GraphAlgorithms | Pure DAG construction, cycle checks, readiness, scheduling, and path math. |
| com.taskflowpro.data | Parameterized SQLite JDBC reads and writes. |
| com.taskflowpro.domain | Immutable domain/API records and JSON-safe enums. |
| com.taskflowpro.ai | Server-side Anthropic client, structured-output validation, and read-only tools. |

### One authoritative mutation gateway

WorkflowService is the sole mutation gateway. Controllers and AI services cannot write repositories directly. Thus, task existence, duplicate prevention, cycle rejection, Ready/Blocked recomputation, validation, and transactional persistence cannot be bypassed by another caller.

## 3. Data model

The SQLite schema is idempotently created at Spring startup. SQLite keeps the hackathon build self-contained and requires no external service.

### tasks

| Field | Constraint | Meaning |
| --- | --- | --- |
| id | text primary key | Backend-generated UUID. |
| title | non-null text | Human-readable task title; blank input is rejected. |
| description | non-null text, default empty | Optional context for AI inspection. |
| column_name | constrained text | backlog, in_progress, review, or done. |
| status | constrained text | Computed ready or blocked. |
| start_date | nullable text | ISO YYYY-MM-DD date, nullable until scheduled. |
| duration | positive integer, default 1 | Planned calendar days. |
| created_at, updated_at | text | UTC service timestamps. |

### dependencies

| Field | Constraint | Meaning |
| --- | --- | --- |
| id | text primary key | Backend-generated UUID. |
| from_task_id | foreign key to tasks | Prerequisite task. |
| to_task_id | foreign key to tasks | Dependent task. |
| created_at | text | UTC creation timestamp. |
| source | constrained text | manual or ai_suggested. |
| edge uniqueness | unique pair (from_task_id, to_task_id) | Prevents duplicate directed edges. |

Indexes on both task-ID columns support graph construction and traversal. Foreign keys cascade on deletion, although the prototype intentionally exposes no delete route.

### task_state_log

Each computed status transition writes the task ID, prior status (nullable at creation), next status, and timestamp. This supports future audit/history views and has a task-ID index.

## 4. Core graph behavior

### Dependency semantics and cycle rejection

fromTaskId -> toTaskId means “destination depends on source.” Before an edge is inserted, the service verifies both IDs, rejects self-dependency and duplicates, then breadth-first searches outward from toTaskId. If it reaches fromTaskId, the proposed edge would close a loop and is rejected before any write happens.

### Ready/Blocked computation and rollback

A task is Ready when all direct prerequisites are in the done column. A task with no prerequisites is Ready. A column change or new dependency recomputes only the changed task and all reachable dependents, not the full board.

    A (done) -> B (ready)
    A moves to in_progress
    => B is recomputed as blocked

Status does not move a card between columns; it is an independent calculated scheduling signal.

### Schedule propagation and diamond safety

Schedule changes visit the source and downstream descendants in restricted topological order. Each task receives one net shift, so converging paths do not compound.

    A -> B -> D
     \-> C -/

An A delay of +3 moves B, C, and D by +3, never D by +6. For delays, the largest relevant incoming shift wins. For pull-ins, an unchanged prerequisite prevents a dependent task moving earlier, while a fully affected branch propagates the negative shift.

simulateScheduleChange is read-only. shiftSchedule persists the exact same calculation transactionally.

### Critical path

Kahn topological sorting plus dynamic programming finds the highest-total-duration prerequisite chain and returns task IDs and total days. It is a DAG longest-path calculation, not a resource planner.

## 5. REST contract and error handling

All routes are under /api; Spring records serialize in camelCase for the existing client.

| Route group | Capability |
| --- | --- |
| GET /health | Liveness response with ok true. |
| GET/POST /tasks and GET /tasks/{id} | List, create, and retrieve tasks. |
| PATCH /tasks/{id}/column | Move a task and return recomputed statuses. |
| GET/POST /dependencies | List or create directed edges. |
| POST task simulate-schedule-change | Read-only what-if propagation. |
| POST task shift-schedule | Persist a calculated schedule shift. |
| upstream/downstream, blocked, critical-path | Graph and scheduling summaries. |
| /ai/* | Optional suggestions, investigation, and drift report. |

Malformed inputs and rejected graph constraints become clear HTTP 400 responses; unknown tasks return 404. Provider/configuration failures become HTTP 502 with a displayable error. Stack traces and credentials are never returned.

## 6. AI / LLM design

### Security boundary

AnthropicLlmClient calls the Messages API from the server over HTTPS. ANTHROPIC_API_KEY is environment-only: it is not exposed to the browser and is never logged. No credential exists in source control.

### Dependency suggestions

The model receives the selected task and current task titles and must return structured JSON. The service retries once after malformed JSON, validates that every referenced task exists, and grounds every candidate in the cycle detector and existing-edge set. The result is review data only; the normal dependency endpoint performs the eventual write.

### Pre-Commit Impact Investigator

The model has eight read-only tools: traversal, blocked tasks, critical path, task listing, cycle checks, and real schedule simulation. Each tool routes through WorkflowService. The model receives serialized results before its next response, so it does not calculate schedule effects from memory. The loop is capped at six tool rounds.

### Drift detector

The model receives a fresh task-description and dependency snapshot. It may return only implied_but_missing_edge or edge_with_no_textual_justification, tied to current task IDs. JSON validation and one retry protect the UI from malformed provider output.

## 7. Security, reliability, and deployment

- Workflow writes are transactional.
- JDBC statements are parameterized.
- Schema constraints supplement service validation and edge uniqueness checks.
- Hikari uses one connection for predictable local SQLite behavior.
- The test suite uses no live LLM calls and includes graph, service/database, AI mock, and HTTP integration coverage.
- Default development uses Vite’s proxy. A separately deployed frontend must explicitly configure CORS allowlists.

| Variable | Default | Purpose |
| --- | --- | --- |
| PORT | 3001 | Spring Boot HTTP port. |
| DATABASE_URL | jdbc:sqlite:./data/taskflow.db | Override JDBC connection URL. |
| ANTHROPIC_API_KEY | unset | Optional server-side AI credential. |
| ANTHROPIC_MODEL | claude-sonnet-4-6 | Optional model identifier. |

## 8. Known limitations and next steps

1. **Identity and access control:** this is a single shared board; it lacks accounts, tenant isolation, roles, and audit identity.
2. **SQLite scale:** multiple service instances can contend on a SQLite file. Production should use PostgreSQL and versioned database migrations.
3. **Scheduling fidelity:** duration is calendar days only; holidays, working calendars, time zones, lags, finish-date constraints, and resources are not modeled.
4. **Critical-path scope:** the longest path does not account for staffing, capacity, critical-chain buffers, or actual completion dates.
5. **AI quality:** suggestions and drift reports are heuristic and can miss or misinterpret relationships. They require human review and are never auto-applied.
6. **AI availability:** missing keys, provider outage/rate limiting, or invalid output make AI features unavailable, although core workflow remains usable.
7. **Bounded investigation:** a six-round cap prevents runaway tool use but may stop complex questions before a final answer.
8. **Feature scope:** no task editing/deletion, dependency removal, bulk operations, undo/redo, persistent user preferences, or state-log UI exists.
9. **Operations:** there are no production metrics, tracing, backups, alerts, retention policies, or readiness check beyond liveness.
10. **Input budgets:** description and request sizes are not capped; production should impose payload and model-token limits.

## 9. Verification evidence

mvn test was run from server on 2026-09-29. JDK 26 compiled Java 21 target code with Spring Boot 3.4.5. The result was **24 tests passed, 0 failed, 0 errors, 0 skipped**:

- 7 pure graph algorithm tests;
- 8 workflow service and SQLite tests;
- 6 deterministic AI service tests;
- 3 embedded-Tomcat HTTP integration tests.
