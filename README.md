# TaskFlow Pro

TaskFlow Pro is a DAG-based Kanban platform for planning work that has real
dependencies. Task readiness is computed from prerequisite completion, schedule
changes propagate safely through the graph, and the optional AI tools help a
user inspect—not bypass—the workflow rules.

The backend is a Java 21 / Spring Boot 3.4 application. The React/Vite client
continues to use the same `/api` contract and proxies development traffic to
port 3001.

## Architecture 
<img width="942" height="635" alt="image" src="https://github.com/user-attachments/assets/4d8ac00a-c4c4-44a8-abe4-7f4284adffa8" />


## Run locally

Prerequisites: JDK 21+ and Maven 3.9+ (Node.js 20+ for the client).

```bash
# Terminal 1 — Spring Boot API
cd server
mvn spring-boot:run

# Terminal 2 — React client
cd client
npm install
npm run dev
```

The API listens on `http://localhost:3001`; the client runs at
`http://localhost:5173`. The SQLite file is created at
`server/data/taskflow.db` by default and is excluded from Git.

Copy `.env.example` to `.env` only when enabling the optional Anthropic-powered
features. The core Kanban, dependency, scheduling, and critical-path features
run without an API key.

## Test

```bash
cd server
mvn test
```

The suite includes pure DAG tests, Spring service/database tests, AI-layer tests
that use a deterministic fake model, and HTTP integration tests against embedded
Tomcat. See `TestCases.MD` for the executed test inventory and
`FailedTestCase.MD` for expected operational failure handling.

## Demo flow

1. Create tasks, then connect a prerequisite to its dependent.
2. Mark the prerequisite Done and watch the dependent become Ready; roll it
   back to see dependents re-block.
3. Create a diamond-shaped graph and simulate a schedule slip—the converged
   task moves once by the maximum relevant delay, never the sum of both paths.
4. Use dependency suggestions, the read-only impact investigator, or the drift
   detector if an Anthropic API key is configured. Suggestions remain human
   reviewed before a dependency is persisted.

The complete architecture, data model, operational constraints, and known
limitations are supplied as a separate design document outside this repository.
