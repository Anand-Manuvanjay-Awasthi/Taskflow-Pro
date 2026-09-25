import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { openDb } from "../src/db/index.js";
import { WorkflowService } from "../src/api/workflow.js";
import { suggestDependencies, type MinimalAnthropicClient } from "../src/ai/suggestDependencies.js";

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

describe("suggestDependencies", () => {
  it("parses a well-formed suggestion and grounds it against the real cycle check", async () => {
    const a = workflow.createTask({ title: "Design schema" });
    const b = workflow.createTask({ title: "Build API" });
    const client = fakeClient([
      JSON.stringify({ suggestions: [{ fromTaskId: a.id, toTaskId: b.id, reason: "API needs the schema" }] }),
    ]);
    const result = await suggestDependencies(workflow, b.id, client);
    expect(result.ok).toBe(true);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].wouldCreateCycle).toBe(false);
    expect(result.suggestions[0].alreadyExists).toBe(false);
  });

  it("flags a suggested edge that would actually create a cycle", async () => {
    const a = workflow.createTask({ title: "A" });
    const b = workflow.createTask({ title: "B" });
    workflow.createDependency(a.id, b.id);
    const client = fakeClient([
      JSON.stringify({ suggestions: [{ fromTaskId: b.id, toTaskId: a.id, reason: "bad suggestion" }] }),
    ]);
    const result = await suggestDependencies(workflow, a.id, client);
    expect(result.ok).toBe(true);
    expect(result.suggestions[0].wouldCreateCycle).toBe(true);
  });

  it("retries once on malformed JSON, then succeeds", async () => {
    const a = workflow.createTask({ title: "A" });
    const b = workflow.createTask({ title: "B" });
    const client = fakeClient([
      "this is not json at all",
      JSON.stringify({ suggestions: [{ fromTaskId: a.id, toTaskId: b.id, reason: "ok now" }] }),
    ]);
    const result = await suggestDependencies(workflow, b.id, client);
    expect(result.ok).toBe(true);
    expect(result.suggestions).toHaveLength(1);
  });

  it("falls back to a clear 'no suggestion' message if it still fails after retry", async () => {
    const a = workflow.createTask({ title: "A" });
    const client = fakeClient(["still not json", "still not json either"]);
    const result = await suggestDependencies(workflow, a.id, client);
    expect(result.ok).toBe(false);
    expect(result.suggestions).toHaveLength(0);
    expect(result.message).toMatch(/no suggestion/i);
  });

  it("falls back when JSON is valid but doesn't match the schema", async () => {
    const a = workflow.createTask({ title: "A" });
    const client = fakeClient([JSON.stringify({ wrong: "shape" }), JSON.stringify({ wrong: "shape" })]);
    const result = await suggestDependencies(workflow, a.id, client);
    expect(result.ok).toBe(false);
  });
});
