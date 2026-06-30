import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "fs";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { env } from "./config/env";
import { createRouter } from "./routes";
import { errorMiddleware, notFoundMiddleware } from "./middleware/error.middleware";

function parseOrigins(value: string): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createApp() {
  const app = express();
  const corsOrigins = parseOrigins(env.CORS_ORIGIN);
  const frontendCandidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(__dirname, "../../"),
    path.resolve(__dirname, "../../../")
  ];
  const frontendRoot = frontendCandidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html"))) || path.resolve(process.cwd(), "..");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://www.gstatic.com"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: [
            "'self'",
            "https://firestore.googleapis.com",
            "https://identitytoolkit.googleapis.com",
            "https://securetoken.googleapis.com",
            "https://www.googleapis.com"
          ]
        }
      }
    })
  );

  app.use(
    cors({
      origin: corsOrigins.length <= 1 ? corsOrigins[0] || false : corsOrigins,
      credentials: true
    })
  );

  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/api", createRouter());

  app.use(express.static(frontendRoot, { index: "index.html" }));
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
