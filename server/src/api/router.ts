import { Router } from "express";
import type Database from "better-sqlite3";
import { z } from "zod";
import { WorkflowService, ValidationError, NotFoundError } from "./workflow.js";

function handleError(err: unknown, res: import("express").Response) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: "internal server error" });
}

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().nullable().optional(),
  duration: z.number().int().positive().optional(),
});

const createDepSchema = z.object({
  fromTaskId: z.string().min(1),
  toTaskId: z.string().min(1),
});

const moveColumnSchema = z.object({
  column: z.enum(["backlog", "in_progress", "review", "done"]),
});

const shiftSchema = z.object({
  deltaDays: z.number().int(),
});

export function buildRouter(db: Database.Database): Router {
  const router = Router();
  const workflow = new WorkflowService(db);

  router.get("/tasks", (_req, res) => {
    res.json(workflow.listTasks());
  });

  router.post("/tasks", (req, res) => {
    try {
      const input = createTaskSchema.parse(req.body);
      const task = workflow.createTask(input);
      res.status(201).json(task);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      handleError(err, res);
    }
  });

  router.get("/tasks/:id", (req, res) => {
    try {
      res.json(workflow.getTask(req.params.id));
    } catch (err) {
      handleError(err, res);
    }
  });

  router.patch("/tasks/:id/column", (req, res) => {
    try {
      const input = moveColumnSchema.parse(req.body);
      const result = workflow.moveTaskColumn(req.params.id, input.column);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      handleError(err, res);
    }
  });

  router.get("/dependencies", (_req, res) => {
    res.json(workflow.listDependencies());
  });

  router.post("/dependencies", (req, res) => {
    try {
      const input = createDepSchema.parse(req.body);
      const dep = workflow.createDependency(input.fromTaskId, input.toTaskId, "manual");
      res.status(201).json(dep);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      handleError(err, res);
    }
  });

  router.post("/tasks/:id/simulate-schedule-change", (req, res) => {
    try {
      const input = shiftSchema.parse(req.body);
      const result = workflow.simulateScheduleChange(req.params.id, input.deltaDays);
      res.json({ results: result });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      handleError(err, res);
    }
  });

  router.post("/tasks/:id/shift-schedule", (req, res) => {
    try {
      const input = shiftSchema.parse(req.body);
      const result = workflow.shiftSchedule(req.params.id, input.deltaDays);
      res.json({ results: result });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      handleError(err, res);
    }
  });

  router.get("/tasks/:id/upstream", (req, res) => {
    try {
      res.json(workflow.getUpstreamTasks(req.params.id));
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get("/tasks/:id/downstream", (req, res) => {
    try {
      res.json(workflow.getDownstreamTasks(req.params.id));
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get("/blocked-tasks", (_req, res) => {
    res.json(workflow.getBlockedTasks());
  });

  router.get("/critical-path", (_req, res) => {
    res.json(workflow.getCriticalPath());
  });

  return router;
}
