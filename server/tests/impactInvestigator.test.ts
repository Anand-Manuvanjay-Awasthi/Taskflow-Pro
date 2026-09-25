import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { openDb } from "../src/db/index.js";
import { WorkflowService } from "../src/api/workflow.js";
import { investigateImpact, type MinimalAnthropicClient } from "../src/ai/impactInvestigator.js";

let db: Database.Database;
let workflow: WorkflowService;

beforeEach(() => {
  db = openDb(":memory:");
  workflow = new WorkflowService(db);
});

describe("investigateImpact", () => {
  it("calls simulateScheduleChange via the tool loop and grounds its answer in the real result", async () => {
    const a = workflow.createTask({ title: "Database migration", startDate: "2026-01-01", duration: 3 });
    const b = workflow.createTask({ title: "API integration", startDate: "2026-01-05", duration: 2 });
    workflow.createDependency(a.id, b.id);

    let round = 0;
    const client: MinimalAnthropicClient = {
      messages: {
        async create() {
          round++;
          if (round === 1) {
            // Model decides to call the simulate tool
            return {
              stop_reason: "tool_use",
              content: [
                {
                  type: "tool_use",
                  id: "call_1",
                  name: "simulateScheduleChange",
                  input: { taskId: a.id, deltaDays: 4 },
                },
              ],
            };
          }
          // Second round: model has the tool result and answers
          return {
            stop_reason: "end_turn",
            content: [{ type: "text", text: `API integration would shift by 4 days.` }],
          };
        },
      },
    } as any;

    const result = await investigateImpact(workflow, "what happens if the database migration slips 4 days?", client);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("simulateScheduleChange");
    const toolResult = result.toolCalls[0].result as any[];
    expect(toolResult.find((r: any) => r.taskId === b.id).shiftDays).toBe(4);
    expect(result.answer).toMatch(/4 days/);

    // Confirm the investigation never persisted anything
    expect(workflow.getTask(b.id).startDate).toBe("2026-01-05");
  });

  it("stops after the round limit if the model never stops calling tools", async () => {
    const a = workflow.createTask({ title: "A" });
    const client: MinimalAnthropicClient = {
      messages: {
        async create() {
          return {
            stop_reason: "tool_use",
            content: [{ type: "tool_use", id: "x", name: "getBlockedTasks", input: {} }],
          };
        },
      },
    } as any;
    const result = await investigateImpact(workflow, "loop forever", client);
    expect(result.answer).toMatch(/did not converge/i);
    expect(result.toolCalls.length).toBe(6);
  });

  it("answers directly with no tool calls when the model doesn't need any", async () => {
    const client: MinimalAnthropicClient = {
      messages: {
        async create() {
          return { stop_reason: "end_turn", content: [{ type: "text", text: "No tasks exist yet." }] };
        },
      },
    } as any;
    const result = await investigateImpact(workflow, "is anything blocked?", client);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.answer).toBe("No tasks exist yet.");
  });
});
