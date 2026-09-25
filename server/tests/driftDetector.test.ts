import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { openDb } from "../src/db/index.js";
import { WorkflowService } from "../src/api/workflow.js";
import { detectDrift, type MinimalAnthropicClient } from "../src/ai/driftDetector.js";

let db: Database.Database;
let workflow: WorkflowService;

beforeEach(() => {
  db = openDb(":memory:");
  workflow = new WorkflowService(db);
});

function fakeClient(responses: string[]): MinimalAnthropicClient {
  let call = 0;
  return {
    messages: {
      async create() {
        const text = responses[Math.min(call, responses.length - 1)];
        call++;
        return { content: [{ type: "text", text }] };
      },
    },
  };
}

describe("detectDrift", () => {
  it("surfaces an implied-but-missing dependency", async () => {
    const a = workflow.createTask({ title: "Set up database" });
    const b = workflow.createTask({ title: "Build API", description: "Blocked by the database setup task." });
    const client = fakeClient([
      JSON.stringify({
        findings: [
          {
            taskId: b.id,
            type: "implied_but_missing_edge",
            relatedTaskId: a.id,
            explanation: "Description says 'blocked by the database setup task' but no edge exists.",
          },
        ],
      }),
    ]);
    const result = await detectDrift(workflow, client);
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].type).toBe("implied_but_missing_edge");
  });

  it("falls back gracefully on repeated malformed output", async () => {
    workflow.createTask({ title: "A" });
    const client = fakeClient(["nope", "still nope"]);
    const result = await detectDrift(workflow, client);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/unavailable/i);
  });

  it("reports no findings cleanly when nothing is amiss", async () => {
    workflow.createTask({ title: "A" });
    const client = fakeClient([JSON.stringify({ findings: [] })]);
    const result = await detectDrift(workflow, client);
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(0);
  });
});
