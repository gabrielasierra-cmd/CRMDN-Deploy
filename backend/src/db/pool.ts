import { Pool } from "pg";
import { env } from "../config/env";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
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
