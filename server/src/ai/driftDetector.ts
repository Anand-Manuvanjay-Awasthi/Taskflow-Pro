import { z } from "zod";
import { getAnthropicClient, MODEL } from "./client.js";
import type { WorkflowService } from "../api/workflow.js";

const driftSchema = z.object({
  findings: z.array(
    z.object({
      taskId: z.string(),
      type: z.enum(["implied_but_missing_edge", "edge_with_no_textual_justification"]),
      relatedTaskId: z.string().nullable(),
      explanation: z.string(),
    })
  ),
});

export interface DriftOutcome {
  ok: boolean;
  findings: Array<{
    taskId: string;
    type: "implied_but_missing_edge" | "edge_with_no_textual_justification";
    relatedTaskId: string | null;
    explanation: string;
  }>;
  message?: string;
}

export interface MinimalAnthropicClient {
  messages: {
    create(args: { model: string; max_tokens: number; messages: { role: "user"; content: string }[] }): Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : text);
}

function buildPrompt(
  tasks: { id: string; title: string; description: string }[],
  edges: { fromTaskId: string; toTaskId: string }[]
) {
  return `You are auditing a project's dependency graph for drift between what task descriptions SAY
about dependencies (language like "waiting on", "blocked by", "requires X", "after Y ships") and
what edges are actually persisted in the graph.

Tasks (id: title — description):
${tasks.map((t) => `  ${t.id}: ${t.title} — ${t.description || "(no description)"}`).join("\n")}

Persisted edges (prerequisite -> dependent):
${edges.map((e) => `  ${e.fromTaskId} -> ${e.toTaskId}`).join("\n") || "  (none)"}

Find mismatches of exactly two kinds:
1. "implied_but_missing_edge": a task's description implies a dependency on another specific task
   that has NO corresponding persisted edge.
2. "edge_with_no_textual_justification": a persisted edge exists between two tasks, but neither
   task's description gives any textual reason to expect that relationship.

Only report findings you can point to specific text for. Respond with ONLY JSON, no prose, no
markdown fences, in exactly this shape:
{"findings": [{"taskId": "<id>", "type": "implied_but_missing_edge", "relatedTaskId": "<id or null>", "explanation": "<short>"}]}

If nothing is found, respond with {"findings": []}.`;
}

/**
 * Scans task descriptions for dependency language and compares it against
 * the actual persisted graph via WorkflowService (never asking the model to
 * recall graph facts from memory — they are always included fresh in the
 * prompt). Validates output against a schema, retries once, and falls back
 * to a clear message on failure, matching the same reliability contract as
 * the dependency suggester.
 */
export async function detectDrift(
  workflow: WorkflowService,
  client: MinimalAnthropicClient = getAnthropicClient() as unknown as MinimalAnthropicClient
): Promise<DriftOutcome> {
  const tasks = workflow.listTasks().map((t) => ({ id: t.id, title: t.title, description: t.description }));
  const edges = workflow.listDependencies().map((d) => ({ fromTaskId: d.fromTaskId, toTaskId: d.toTaskId }));
  const prompt = buildPrompt(tasks, edges);

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const userContent =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous response failed to parse. Error: ${lastError}\nRespond again with ONLY the corrected JSON object.`;
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: userContent }],
      });
      const text = response.content
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("\n");
      const parsed = driftSchema.parse(extractJson(text));
      return { ok: true, findings: parsed.findings };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return {
    ok: false,
    findings: [],
    message: `Drift report unavailable: the model's response could not be parsed after a retry (${lastError}).`,
  };
}
