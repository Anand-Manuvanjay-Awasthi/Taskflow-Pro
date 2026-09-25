import { z } from "zod";
import { getAnthropicClient, MODEL } from "./client.js";
import type { WorkflowService } from "../api/workflow.js";

const suggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      fromTaskId: z.string(),
      toTaskId: z.string(),
      reason: z.string(),
    })
  ),
});

export type DependencySuggestions = z.infer<typeof suggestionSchema>;

export interface SuggestionOutcome {
  ok: boolean;
  suggestions: Array<{
    fromTaskId: string;
    toTaskId: string;
    reason: string;
    wouldCreateCycle: boolean;
    alreadyExists: boolean;
  }>;
  message?: string;
}

function extractJson(text: string): unknown {
  // Models occasionally wrap JSON in prose or fences despite instructions;
  // pull out the first {...} block defensively.
  const match = text.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : text;
  return JSON.parse(jsonText);
}

function buildPrompt(taskTitle: string, taskDescription: string, existingTasks: { id: string; title: string }[]) {
  return `You are helping plan a dependency graph for a Kanban project called TaskFlow Pro.

New task:
  title: ${taskTitle}
  description: ${taskDescription}

Existing tasks (id: title):
${existingTasks.map((t) => `  ${t.id}: ${t.title}`).join("\n") || "  (none yet)"}

Propose candidate dependency edges involving the new task (it may be the prerequisite or the
dependent of an existing task). Only propose edges you have reasonable evidence for from the
titles/description — do not invent plausible-sounding but unfounded relationships.

Respond with ONLY a JSON object, no markdown fences, no prose, in exactly this shape:
{"suggestions": [{"fromTaskId": "<id>", "toTaskId": "<id>", "reason": "<short reason>"}]}

If no relationships are apparent, respond with {"suggestions": []}.`;
}

/**
 * Calls the LLM to propose dependency edges for a new task, validates the
 * structured output against a schema, retries once (feeding the parse error
 * back to the model) if it fails, and falls back to "no suggestion" with a
 * clear message rather than crashing the request.
 *
 * Every candidate is then re-checked against the REAL cycle-detection and
 * duplicate-detection logic (never trusting the model's own claims), and
 * results are returned for human review — nothing is persisted here.
 */
export interface MinimalAnthropicClient {
  messages: {
    create(args: { model: string; max_tokens: number; messages: { role: "user"; content: string }[] }): Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

export async function suggestDependencies(
  workflow: WorkflowService,
  taskId: string,
  client: MinimalAnthropicClient = getAnthropicClient()
): Promise<SuggestionOutcome> {
  const task = workflow.getTask(taskId);
  const existingTasks = workflow.listTasks().filter((t) => t.id !== taskId);
  const prompt = buildPrompt(task.title, task.description, existingTasks);

  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const userContent =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous response failed to parse as valid JSON matching the required shape. Error: ${lastError}\nRespond again with ONLY the corrected JSON object.`;

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1000,
        messages: [{ role: "user", content: userContent }],
      });
      const text = response.content
        .filter((b): b is Anthropic_TextBlock => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("\n");

      const parsed = suggestionSchema.parse(extractJson(text));

      // Ground every suggestion against the real DAG engine before returning it.
      const checked = parsed.suggestions.map((s) => ({
        ...s,
        wouldCreateCycle: workflow.wouldCreateCycle(s.fromTaskId, s.toTaskId),
        alreadyExists: workflow
          .listDependencies()
          .some((d) => d.fromTaskId === s.fromTaskId && d.toTaskId === s.toTaskId),
      }));
      return { ok: true, suggestions: checked };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    ok: false,
    suggestions: [],
    message: `No suggestion available: the model's response could not be parsed after a retry (${lastError}).`,
  };
}

// Minimal local type alias to avoid pulling the full SDK type surface here.
type Anthropic_TextBlock = { type: "text"; text: string };
