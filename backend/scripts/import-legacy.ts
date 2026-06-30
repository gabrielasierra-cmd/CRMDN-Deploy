import fs from "fs";
import path from "path";
import { pool } from "../src/db/pool";
import { env } from "../src/config/env";

interface LegacyDump {
  organizationName: string;
  users?: Array<{ fullName: string; email: string; passwordHash: string; role?: "admin" | "staff" }>;
  clients?: Array<{ name: string; email?: string; phone?: string; notes?: string }>;
  services?: Array<{ name: string; description?: string; durationMinutes: number; price: number }>;
  expenses?: Array<{ category: string; description?: string; amount: number; expenseDate: string }>;
}

async function getSharedOrganizationId(client: import("pg").PoolClient): Promise<string> {
  const organizationName = String(env.SHARED_ORGANIZATION_NAME || "Shared Workspace").trim() || "Shared Workspace";

  const existing = await client.query<{ id: string }>(
    `SELECT id
     FROM organizations
     WHERE name = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [organizationName]
  );

  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }

  const created = await client.query<{ id: string }>(
    `INSERT INTO organizations (name)
     VALUES ($1)
     RETURNING id`,
    [organizationName]
  );

  return created.rows[0].id;
}

async function importLegacyData(filePath: string) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const raw = fs.readFileSync(absolutePath, "utf-8");
  const legacy = JSON.parse(raw) as LegacyDump;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const organizationId = await getSharedOrganizationId(client);

    let adminUserId: string | null = null;

    if (legacy.users?.length) {
      for (const user of legacy.users) {
        const userResult = await client.query<{ id: string }>(
          `INSERT INTO users (email, full_name, password_hash)
           VALUES ($1, $2, $3) RETURNING id`,
          [user.email, user.fullName, user.passwordHash]
        );
        const roleName = user.role ?? "staff";
        const roleId = await client.query<{ id: number }>(`SELECT id FROM roles WHERE name = $1`, [roleName]);
        await client.query(
          `INSERT INTO user_organizations (user_id, organization_id, role_id) VALUES ($1, $2, $3)`,
          [userResult.rows[0].id, organizationId, roleId.rows[0].id]
        );
        if (!adminUserId && roleName === "admin") {
          adminUserId = userResult.rows[0].id;
        }
      }
    }

    if (legacy.clients?.length) {
      for (const row of legacy.clients) {
        await client.query(
          `INSERT INTO clients (organization_id, name, email, phone, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [organizationId, row.name, row.email ?? null, row.phone ?? null, row.notes ?? null]
        );
      }
    }

    if (legacy.services?.length) {
      for (const row of legacy.services) {
        await client.query(
          `INSERT INTO services (organization_id, name, description, duration_minutes, price)
           VALUES ($1, $2, $3, $4, $5)`,
          [organizationId, row.name, row.description ?? null, row.durationMinutes, row.price]
        );
      }
    }

    if (legacy.expenses?.length) {
      for (const row of legacy.expenses) {
        await client.query(
          `INSERT INTO expenses (organization_id, category, description, amount, expense_date, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [organizationId, row.category, row.description ?? null, row.amount, row.expenseDate, adminUserId]
        );
      }
    }

    await client.query("COMMIT");
    // eslint-disable-next-line no-console
    console.log("Legacy import complete", { organizationId });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const sourceFile = process.argv[2] ?? "../database/legacy/legacy-export.json";
importLegacyData(sourceFile)
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
