# AI Usage Log

This is an engineering disclosure of AI involvement in TaskFlow Pro.

## Development assistance

- **2026-09-26** — Repository scaffold, original workflow features, client,
  and tests were developed with Claude (Sonnet 5) assistance from a detailed
  developer prompt. The developer reviewed the resulting changes.
- **2026-09-29** — The backend was completed as a Java/Spring Boot service
  with AI assistance. The final implementation was compiled and verified using
  its JUnit integration and unit test suite before commit.

## Product-facing AI features

The optional Anthropic integration runs on the server only. The API key is read
from `ANTHROPIC_API_KEY`, is never sent to the browser, and is never logged.

1. **Dependency suggestions** return structured candidates for human review.
   Each candidate is checked against the current task IDs, duplicate edges, and
   the real cycle detector before it is returned.
2. **Pre-Commit Impact Investigator** uses a bounded tool-calling loop. For a
   date or slip question, it is instructed to call the read-only scheduling
   engine rather than inventing schedule math.
3. **Semantic-Structural Drift Detector** receives a fresh task and edge
   snapshot, then returns schema-checked findings about description/graph
   mismatches.

The AI layer has no direct database access and cannot bypass dependency
validation, transactional writes, cycle rejection, or the scheduling engine.
All persisted dependency changes go through the same normal workflow API that
the user interface uses.
