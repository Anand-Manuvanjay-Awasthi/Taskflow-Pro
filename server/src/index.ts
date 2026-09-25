import "dotenv/config";
import express from "express";
import { openDb } from "./db/index.js";
import { buildRouter } from "./api/router.js";
import { buildAiRouter } from "./ai/router.js";

const PORT = Number(process.env.PORT) || 3001;
const db = openDb();

const app = express();
app.use(express.json());

app.use("/api", buildRouter(db));
app.use("/api/ai", buildAiRouter(db));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`TaskFlow Pro server listening on http://localhost:${PORT}`);
});
