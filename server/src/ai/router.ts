import { Router } from "express";
import type Database from "better-sqlite3";
import { z } from "zod";
import { WorkflowService, NotFoundError } from "../api/workflow.js";
import { suggestDependencies } from "./suggestDependencies.js";
import { investigateImpact } from "./impactInvestigator.js";
import { detectDrift } from "./driftDetector.js";

const questionSchema = z.object({ question: z.string().min(1) });

export function buildAiRouter(db: Database.Database): Router {
  const router = Router();
  const workflow = new WorkflowService(db);

  router.post("/tasks/:id/suggest-dependencies", async (req, res) => {
    try {
      const result = await suggestDependencies(workflow, req.params.id);
      res.json(result);
    } catch (err) {
      if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
      const message = err instanceof Error ? err.message : "unknown error";
      // Missing/invalid API key or a network failure should not 500 with a
      // stack trace — surface a clear, actionable message instead.
      res.status(502).json({ ok: false, suggestions: [], message: `AI suggestion unavailable: ${message}` });
    }
  });

  router.post("/investigate", async (req, res) => {
    try {
      const input = questionSchema.parse(req.body);
      const result = await investigateImpact(workflow, input.question);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      const message = err instanceof Error ? err.message : "unknown error";
      res.status(502).json({ answer: `Investigation unavailable: ${message}`, toolCalls: [] });
    }
  });

  router.get("/drift-report", async (_req, res) => {
    try {
      const result = await detectDrift(workflow);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      res.status(502).json({ ok: false, findings: [], message: `Drift report unavailable: ${message}` });
    }
  });

  return router;
}
