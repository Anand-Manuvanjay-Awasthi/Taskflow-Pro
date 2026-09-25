import { getAnthropicClient, MODEL } from "./client.js";
import { buildToolImplementations, TOOL_DEFINITIONS, type ToolImplementations } from "./tools.js";
import type { WorkflowService } from "../api/workflow.js";

export interface MinimalAnthropicClient {
  messages: {
    create(args: any): Promise<{ content: any[]; stop_reason?: string }>;
  };
}

export interface InvestigatorOutcome {
  answer: string;
  toolCalls: Array<{ name: string; input: unknown; result: unknown }>;
}

const SYSTEM_PROMPT = `You are the Pre-Commit Impact Investigator for TaskFlow Pro, a DAG-based Kanban tool.
A user will ask a natural-language "what if" question about the project's schedule or dependency graph.
You have tool access to the REAL dependency graph and scheduling engine — you must call tools to get
facts (upstream/downstream tasks, blocked tasks, critical path, and especially simulateScheduleChange
for any date/slip question) rather than inventing numbers or relationships yourself. Never claim an
impact you have not verified with a tool call. After gathering what you need, give a concise,
concrete answer citing the specific tasks and day counts the tools returned. Nothing you do here is
persisted — this is a read-only investigation.`;

/**
 * Runs a bounded tool-calling loop (max 6 rounds) so the model can gather
 * whatever graph/schedule facts it needs before answering. All tool calls
 * go through buildToolImplementations(workflow), i.e. the same validated
 * WorkflowService as everything else — the agent has no other way to touch
 * the graph, and every tool it can call here is read-only.
 */
export async function investigateImpact(
  workflow: WorkflowService,
  question: string,
  client: MinimalAnthropicClient = getAnthropicClient() as unknown as MinimalAnthropicClient
): Promise<InvestigatorOutcome> {
  const tools = buildToolImplementations(workflow);
  const toolCalls: InvestigatorOutcome["toolCalls"] = [];

  const messages: any[] = [{ role: "user", content: question }];

  for (let round = 0; round < 6; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    const toolUseBlocks = response.content.filter((b: any) => b.type === "tool_use");

    if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") {
      const textBlocks = response.content.filter((b: any) => b.type === "text");
      const answer = textBlocks.map((b: any) => b.text).join("\n").trim();
      return { answer: answer || "(no answer produced)", toolCalls };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults = [];
    for (const block of toolUseBlocks) {
      const impl = (tools as ToolImplementations)[block.name as keyof ToolImplementations];
      let result: unknown;
      try {
        result = impl ? (impl as (args: unknown) => unknown)(block.input) : { error: `unknown tool ${block.name}` };
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      toolCalls.push({ name: block.name, input: block.input, result });
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return {
    answer: "Investigation did not converge within the tool-call round limit. Try a more specific question.",
    toolCalls,
  };
}
