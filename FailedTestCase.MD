# Known Failure Cases and Expected Handling

There are no failing automated tests in the final verification run (`24 passed,
0 failed`). This file records expected operational failure modes and the
behavior a reviewer can reproduce.

| Case | Expected behavior | Status |
| --- | --- | --- |
| Missing or invalid `ANTHROPIC_API_KEY` | AI endpoints return a 502 response with an actionable message. Core workflow endpoints remain usable. | Expected, graceful failure |
| Anthropic response is malformed or has an invalid schema | Suggestions and drift detection retry once, then return `ok: false` with an empty result and explanatory message. | Covered by tests |
| Impact model continually requests tools | The investigation stops after six rounds and returns a non-convergence message; it never writes task data. | Covered by tests |
| Suggested/drift task ID does not exist in the board | The model output is rejected as invalid and follows the retry/fallback path. | Expected, graceful failure |
| Duplicate, self-referencing, cyclic, or unknown dependency | The normal workflow API returns HTTP 400/404 and does not persist the invalid edge. | Covered by tests |
| A date is not ISO `YYYY-MM-DD` when a shift is attempted | The request is rejected before any schedule write occurs. | Covered by tests |
| Multiple application instances write to one SQLite file | SQLite can report a lock under concurrent writes; deploy a production database such as PostgreSQL before horizontal scaling. | Known deployment constraint |

Product limitations that are not failures (for example, heuristic AI output,
single-board authorization scope, and resource-unaware critical paths) are
documented in the separately delivered design document.
