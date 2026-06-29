import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, rootDir } from "./config.js";
import { apiRouter } from "./routes/api.js";
import { x402Middleware } from "./chain/x402.js";
import { apiAuthMiddleware, installClerkMiddleware } from "./middleware/auth.js";

async function main() {
  const { getDb } = await import("@agntpymt/db");
  getDb();

  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json());
  app.use(installClerkMiddleware());
  app.use(x402Middleware);
  app.use("/api", apiAuthMiddleware, apiRouter);

  const clientDist = path.join(rootDir, "client", "dist");
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  app.listen(env.port, () => {
    console.log(`AgntPymt API running on http://localhost:${env.port}`);
    console.log(
      `Payment mode: ${env.simulatePayments ? "SIMULATED" : "x402 (Base Sepolia via facilitator)"}`
    );
  });
}

main().catch(console.error);
