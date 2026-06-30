import { Pool } from "pg";
import { env } from "../config/env";

function databaseUrl(): string {
  const url = new URL(env.DATABASE_URL);
  const match = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (!match) return env.DATABASE_URL;

  const projectRef = match[1];
  const poolerHost =
    env.SUPABASE_POOLER_HOST ||
    (projectRef === "jxnxyyyyxlwjlnabsrdr" ? "aws-1-eu-central-2.pooler.supabase.com" : undefined);
  if (!poolerHost) return env.DATABASE_URL;

  if (!url.username.includes(".")) {
    url.username = `${url.username}.${projectRef}`;
  }
  url.hostname = poolerHost;
  url.port = String(env.SUPABASE_POOLER_PORT);
  return url.toString();
}

export const pool = new Pool({
  connectionString: databaseUrl(),
  ssl: env.DATABASE_SSL
    ? {
        rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED
      }
    : undefined,
  max: 20,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000
});

export async function closePool(): Promise<void> {
  await pool.end();
}
