# Executed Test Cases

Run on 2026-09-29 with JDK 26 compiling to Java 21 bytecode and Spring Boot
3.4.5:

```bash
cd server
mvn test
```

Result: **24 tests passed; 0 failures, 0 errors, 0 skipped.** No live Anthropic
requests are made by this suite; model responses are deterministic fakes.

## `GraphAlgorithmsTest` — 7 passed

1. Detect direct and multi-node dependency cycles, including a defensive
   full-graph cycle check.
2. Reject self-referencing edges while accepting valid diamond edges.
3. Compute Ready/Blocked status for no, incomplete, and fully complete sets of
   prerequisites.
4. Recompute status only for a changed task and its descendants.
5. Propagate a delay through a diamond without double-counting the converged
   task.
6. Propagate an earlier schedule when every prerequisite moves earlier.
7. Prevent an earlier pull-in when an unchanged prerequisite would still gate
   the dependent task.

## `WorkflowServiceTest` — 8 passed

1. Create tasks, link a dependency, and update readiness after Done.
2. Reject a proposed cycle before it is stored.
3. Reject self, duplicate, and unknown-task dependencies.
4. Reject blank task titles and non-positive durations.
5. Prove simulation is read-only, then persist a diamond-safe schedule shift.
6. Re-block descendants after a Done task is rolled back to In Progress.
7. Return transitive upstream/downstream tasks and calculate the critical path.
8. Reject an invalid stored date before a schedule write can occur.

## `AiServiceTest` — 6 passed

1. Ground a valid dependency suggestion against the real cycle detector.
2. Flag a cyclic suggestion and verify it does not write an edge.
3. Retry malformed suggestion JSON once and return a clear fallback after two
   invalid responses.
4. Require the impact investigator to use the read-only schedule tool and
   prove no date is persisted.
5. Stop an endlessly tool-calling investigator at the six-round limit.
6. Parse grounded drift output and gracefully handle repeated malformed output.

## `WorkflowApiIntegrationTest` — 3 passed

1. Exercise health, task creation, dependency creation, and Ready/Blocked
   lifecycle through HTTP/JSON.
2. Verify schedule simulation does not write and schedule application does.
3. Verify clear HTTP 400 responses for invalid input and cycles.

## Packaged live smoke test — passed

After packaging with `mvn package -DskipTests`, the executable JAR was started
with its default local SQLite configuration. The smoke flow verified all of the
following before the process was stopped:

1. `GET /api/health` returned `ok: true`.
2. `POST /api/tasks` created a task with computed status `ready`.
3. `POST /api/tasks/{id}/simulate-schedule-change` with `deltaDays: 2`
   returned `2026-01-03` for a task starting on `2026-01-01`.
