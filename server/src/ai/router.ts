import { Router } from "express";
import type Database from "better-sqlite3";
export function buildAiRouter(_db: Database.Database): Router {
  const router = Router();
  return router;
}
