import type { WorkflowService } from "../api/workflow.js";

/**
 * Every function here is a 1:1 wrapper over WorkflowService — the SAME
 * validated layer the UI uses. The agent cannot bypass cycle checks,
 * validation, or the scheduling engine, because it has no other way to
 * touch the graph. These wrappers never write graph state; the only
 * "write-shaped" tool (createDependencySuggestion) stages a suggestion for
 * human review rather than persisting an edge.
 */
export function buildToolImplementations(workflow: WorkflowService) {
  return {
    getTaskDependencies(args: { taskId: string }) {
      return workflow.getTaskDependencies(args.taskId);
    },
    getUpstreamTasks(args: { taskId: string }) {
      return workflow.getUpstreamTasks(args.taskId);
    },
    getDownstreamTasks(args: { taskId: string }) {
      return workflow.getDownstreamTasks(args.taskId);
    },
    getBlockedTasks() {
      return workflow.getBlockedTasks();
    },
    getCriticalPath() {
      return workflow.getCriticalPath();
    },
    simulateScheduleChange(args: { taskId: string; deltaDays: number }) {
      // Read-only: does NOT persist. This is the one true source of impact
      // numbers — the agent must call this rather than computing shifts
      // itself, so its explanations are always grounded in the real engine.
      return workflow.simulateScheduleChange(args.taskId, args.deltaDays);
    },
    checkCycle(args: { fromTaskId: string; toTaskId: string }) {
      return { wouldCreateCycle: workflow.wouldCreateCycle(args.fromTaskId, args.toTaskId) };
    },
    listTasks() {
      return workflow.listTasks();
    },
  };
}

export type ToolImplementations = ReturnType<typeof buildToolImplementations>;

/** Anthropic tool-use JSON schemas describing the above functions to the model. */
export const TOOL_DEFINITIONS = [
  {
    name: "getTaskDependencies",
    description: "Get both upstream (prerequisite) and downstream (dependent) tasks for a task.",
    input_schema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
  {
    name: "getUpstreamTasks",
    description: "Get all transitive prerequisite tasks (ancestors) of a task.",
    input_schema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
  {
    name: "getDownstreamTasks",
    description: "Get all transitive dependent tasks (descendants) of a task.",
    input_schema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
  {
    name: "getBlockedTasks",
    description: "List every task currently in Blocked status.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "getCriticalPath",
    description: "Compute the current critical (longest) path through the dependency graph.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "simulateScheduleChange",
    description:
      "Read-only what-if: compute how shifting a task's start date by deltaDays (positive = later, negative = earlier) would propagate through the REAL scheduling engine, without persisting anything. Always call this instead of estimating impact yourself.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        deltaDays: { type: "integer" },
      },
      required: ["taskId", "deltaDays"],
    },
  },
  {
    name: "checkCycle",
    description: "Check whether adding a dependency edge (fromTaskId -> toTaskId) would create a cycle.",
    input_schema: {
      type: "object",
      properties: {
        fromTaskId: { type: "string" },
        toTaskId: { type: "string" },
      },
      required: ["fromTaskId", "toTaskId"],
    },
  },
  {
    name: "listTasks",
    description: "List all tasks in the board with their current column, status, and schedule.",
    input_schema: { type: "object", properties: {} },
  },
] as const;
