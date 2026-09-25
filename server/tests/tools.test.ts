import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { openDb } from "../src/db/index.js";
import { WorkflowService } from "../src/api/workflow.js";
import { buildToolImplementations } from "../src/ai/tools.js";

let db: Database.Database;
let workflow: WorkflowService;
let tools: ReturnType<typeof buildToolImplementations>;

beforeEach(() => {
  db = openDb(":memory:");
  workflow = new WorkflowService(db);
  tools = buildToolImplementations(workflow);
});

describe("AI tool layer (thin wrappers over WorkflowService)", () => {
  it("getUpstreamTasks / getDownstreamTasks match the workflow service directly", () => {
    const a = workflow.createTask({ title: "A" });
    const b = workflow.createTask({ title: "B" });
    workflow.createDependency(a.id, b.id);

    expect(tools.getUpstreamTasks({ taskId: b.id }).map((t) => t.id)).toEqual([a.id]);
    expect(tools.getDownstreamTasks({ taskId: a.id }).map((t) => t.id)).toEqual([b.id]);
  });

  it("checkCycle reports true for an edge that would close a loop", () => {
    const a = workflow.createTask({ title: "A" });
    const b = workflow.createTask({ title: "B" });
    workflow.createDependency(a.id, b.id);
    expect(tools.checkCycle({ fromTaskId: b.id, toTaskId: a.id })).toEqual({ wouldCreateCycle: true });
    expect(tools.checkCycle({ fromTaskId: a.id, toTaskId: b.id })).toEqual({ wouldCreateCycle: false });
  });

  it("simulateScheduleChange never persists (agent cannot write via this tool)", () => {
    const a = workflow.createTask({ title: "A", startDate: "2026-01-01", duration: 1 });
    const b = workflow.createTask({ title: "B", startDate: "2026-01-02", duration: 1 });
    workflow.createDependency(a.id, b.id);

    tools.simulateScheduleChange({ taskId: a.id, deltaDays: 5 });
    expect(workflow.getTask(b.id).startDate).toBe("2026-01-02"); // unchanged
  });

  it("getBlockedTasks reflects only blocked tasks", () => {
    const a = workflow.createTask({ title: "A" });
    const b = workflow.createTask({ title: "B" });
    workflow.createDependency(a.id, b.id);
    const blocked = tools.getBlockedTasks();
    expect(blocked.map((t) => t.id)).toEqual([b.id]);
  });
});
