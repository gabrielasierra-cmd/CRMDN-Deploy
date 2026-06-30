import crypto from "crypto";
import { pool } from "../../db/pool";
import { env } from "../../config/env";

interface CreateUserParams {
  fullName: string;
  email: string;
  passwordHash: string;
  organizationName: string;
}

export interface UserAuthRecord {
  userId: string;
  email: string;
  fullName: string;
  passwordHash: string;
  organizationId: string;
  role: "admin" | "staff";
}

export class AuthRepository {
  private sharedOrganizationIdPromise: Promise<string> | null = null;

  private async getSharedOrganizationId(): Promise<string> {
    if (!this.sharedOrganizationIdPromise) {
      this.sharedOrganizationIdPromise = (async () => {
        const organizationName = String(env.SHARED_ORGANIZATION_NAME || "Shared Workspace").trim() || "Shared Workspace";

        const existing = await pool.query<{ id: string }>(
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

        const created = await pool.query<{ id: string }>(
          `INSERT INTO organizations (name)
           VALUES ($1)
           RETURNING id`,
          [organizationName]
        );

        return created.rows[0].id;
      })().catch((error) => {
        this.sharedOrganizationIdPromise = null;
        throw error;
      });
    }

    return this.sharedOrganizationIdPromise;
  }

  async createUserWithOrganization(params: CreateUserParams): Promise<UserAuthRecord> {
    const organizationId = await this.getSharedOrganizationId();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const userResult = await client.query<{ id: string; email: string; full_name: string; password_hash: string }>(
        `INSERT INTO users (email, full_name, password_hash) VALUES ($1, $2, $3)
         RETURNING id, email, full_name, password_hash`,
        [params.email, params.fullName, params.passwordHash]
      );

      const roleResult = await client.query<{ id: number }>(
        `SELECT id FROM roles WHERE name = 'admin' LIMIT 1`
      );

      await client.query(
        `INSERT INTO user_organizations (user_id, organization_id, role_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, organization_id)
         DO UPDATE SET role_id = EXCLUDED.role_id`,
        [userResult.rows[0].id, organizationId, roleResult.rows[0].id]
      );

      await client.query("COMMIT");

      return {
        userId: userResult.rows[0].id,
        email: userResult.rows[0].email,
        fullName: userResult.rows[0].full_name,
        passwordHash: userResult.rows[0].password_hash,
        organizationId,
        role: "admin"
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findByEmail(email: string): Promise<UserAuthRecord | null> {
    const sharedOrganizationId = await this.getSharedOrganizationId();
    const result = await pool.query<{
      user_id: string;
      email: string;
      full_name: string;
      password_hash: string;
      organization_id: string;
      role_name: "admin" | "staff";
    }>(
      `SELECT u.id as user_id, u.email, u.full_name, u.password_hash,
              uo.organization_id, r.name as role_name
       FROM users u
       JOIN user_organizations uo ON uo.user_id = u.id
       JOIN roles r ON r.id = uo.role_id
       WHERE u.email = $1
       ORDER BY CASE WHEN uo.organization_id = $2 THEN 0 ELSE 1 END, uo.created_at ASC
       LIMIT 1`,
      [email, sharedOrganizationId]
    );

    if (!result.rows.length) {
      return null;
    }

    const row = result.rows[0];
    return {
      userId: row.user_id,
      email: row.email,
      fullName: row.full_name,
      passwordHash: row.password_hash,
      organizationId: row.organization_id,
      role: row.role_name
    };
  }

  async storeRefreshToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    const tokenHash = this.hashToken(token);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  }

  async isRefreshTokenValid(userId: string, token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);
    const result = await pool.query(
      `SELECT id FROM refresh_tokens
       WHERE user_id = $1
       AND token_hash = $2
       AND revoked_at IS NULL
       AND expires_at > NOW()
       LIMIT 1`,
      [userId, tokenHash]
    );
    return !!result.rows.length;
  }

  async revokeRefreshToken(userId: string, token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL`,
      [userId, tokenHash]
    );
  }

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
