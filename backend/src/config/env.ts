import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const trimmedString = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1)
);

const optionalTrimmedString = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const text = value.trim();
    return text.length ? text : undefined;
  },
  z.string().min(1).optional()
);

const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return value ?? defaultValue;

    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return value;
  }, z.boolean().default(defaultValue));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: trimmedString,
  JWT_ACCESS_SECRET: z.string().trim().min(32),
  JWT_REFRESH_SECRET: z.string().trim().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  CORS_ORIGIN: z.string().trim().default("http://localhost:5500"),
  DATABASE_SSL: booleanFromEnv(false),
  DATABASE_SSL_REJECT_UNAUTHORIZED: booleanFromEnv(true),
  SHARED_ORGANIZATION_NAME: z.string().trim().default("Shared Workspace"),
  OPENAI_API_KEY: optionalTrimmedString,
  OPENAI_MODEL: z.string().trim().default("gpt-5.5"),
  OPENAI_VIDEO_FRAME_COUNT: z.coerce.number().int().positive().max(10).default(6)
});

export const env = envSchema.parse(process.env);
