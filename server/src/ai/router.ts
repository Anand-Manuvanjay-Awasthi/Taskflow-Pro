import { Router } from "express";
import type Database from "better-sqlite3";
import { WorkflowService, NotFoundError } from "../api/workflow.js";
import { suggestDependencies } from "./suggestDependencies.js";

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

  return router;
}
