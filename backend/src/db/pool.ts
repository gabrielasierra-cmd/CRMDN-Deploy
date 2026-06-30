import { Pool } from "pg";
import { env } from "../config/env";

function databaseUrl(): string {
  if (!env.SUPABASE_POOLER_HOST) return env.DATABASE_URL;

  const url = new URL(env.DATABASE_URL);
  const match = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (!match) return env.DATABASE_URL;

  const projectRef = match[1];
  if (!url.username.includes(".")) {
    url.username = `${url.username}.${projectRef}`;
  }
  url.hostname = env.SUPABASE_POOLER_HOST;
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
