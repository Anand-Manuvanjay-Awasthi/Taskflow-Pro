import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { openDb } from "../src/db/index.js";
import { WorkflowService, ValidationError, NotFoundError } from "../src/api/workflow.js";

let db: Database.Database;
let workflow: WorkflowService;

beforeEach(() => {
  db = openDb(":memory:");
  workflow = new WorkflowService(db);
});

describe("Workflow API — end to end", () => {
  it("creates tasks, links a dependency, and reports Ready/Blocked correctly", () => {
    const a = workflow.createTask({ title: "Design schema" });
    const b = workflow.createTask({ title: "Build API" });

    expect(a.status).toBe("ready"); // no prereqs
    expect(b.status).toBe("ready"); // no prereqs yet

    workflow.createDependency(a.id, b.id);
    // b now depends on a; a is still in backlog (not done) -> b becomes blocked
    const bAfter = workflow.getTask(b.id);
    expect(bAfter.status).toBe("blocked");

    // Move a to done -> b should become ready via recompute
    workflow.moveTaskColumn(a.id, "done");
    const bFinal = workflow.getTask(b.id);
    expect(bFinal.status).toBe("ready");
  });

  it("rejects a cycle before it is persisted", () => {
    const a = workflow.createTask({ title: "A" });
    const b = workflow.createTask({ title: "B" });
    workflow.createDependency(a.id, b.id);

    expect(() => workflow.createDependency(b.id, a.id)).toThrow(ValidationError);
    // Confirm the rejected edge never made it into storage
    const deps = workflow.listDependencies();
    expect(deps.some((d) => d.fromTaskId === b.id && d.toTaskId === a.id)).toBe(false);
    expect(deps.length).toBe(1);
  });

  it("rejects a dependency to a nonexistent task with a clear error, not a 500/no-op", () => {
    const a = workflow.createTask({ title: "A" });
    expect(() => workflow.createDependency(a.id, "does-not-exist")).toThrow(NotFoundError);
  });

  it("rejects a self-referencing dependency", () => {
    const a = workflow.createTask({ title: "A" });
    expect(() => workflow.createDependency(a.id, a.id)).toThrow(ValidationError);
  });

  it("rejects task creation with missing title", () => {
    expect(() => workflow.createTask({ title: "" })).toThrow(ValidationError);
  });

  it("diamond dependency shift does not compound through the real service", () => {
    const a = workflow.createTask({ title: "A", startDate: "2026-01-01", duration: 2 });
    const b = workflow.createTask({ title: "B", startDate: "2026-01-05", duration: 2 });
    const c = workflow.createTask({ title: "C", startDate: "2026-01-05", duration: 2 });
    const d = workflow.createTask({ title: "D", startDate: "2026-01-10", duration: 2 });
    workflow.createDependency(a.id, b.id);
    workflow.createDependency(a.id, c.id);
    workflow.createDependency(b.id, d.id);
    workflow.createDependency(c.id, d.id);

    const sim = workflow.simulateScheduleChange(a.id, 3);
    const dResult = sim.find((r) => r.taskId === d.id)!;
    expect(dResult.shiftDays).toBe(3);

    // simulate must NOT persist
    expect(workflow.getTask(d.id).startDate).toBe("2026-01-10");

    // the real (persisting) call should match the simulation
    workflow.shiftSchedule(a.id, 3);
    expect(workflow.getTask(d.id).startDate).toBe("2026-01-13");
  });

  it("rollback re-blocks downstream tasks", () => {
    const a = workflow.createTask({ title: "A" });
    const b = workflow.createTask({ title: "B" });
    workflow.createDependency(a.id, b.id);
    workflow.moveTaskColumn(a.id, "done");
    expect(workflow.getTask(b.id).status).toBe("ready");

    workflow.moveTaskColumn(a.id, "in_progress");
    expect(workflow.getTask(b.id).status).toBe("blocked");
  });
});
