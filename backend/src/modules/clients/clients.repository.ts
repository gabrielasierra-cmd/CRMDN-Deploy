import { pool } from "../../db/pool";
import { Pagination } from "../shared/pagination";

interface CreateClientInput {
  organizationId: string;
  name: string;
  company_name?: string;
  nif?: string;
  address?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

interface UpdateClientInput {
  organizationId: string;
  clientId: string;
  name: string;
  company_name?: string | null;
  nif?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export class ClientsRepository {
  async list(organizationId: string, pagination: Pagination) {
    const offset = (pagination.page - 1) * pagination.pageSize;
    const [itemsResult, totalResult] = await Promise.all([
      pool.query(
        `SELECT id, name, company_name, nif, address, email, phone, notes, created_at
         FROM clients
         WHERE organization_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [organizationId, pagination.pageSize, offset]
      ),
      pool.query(`SELECT COUNT(*)::int as total FROM clients WHERE organization_id = $1`, [organizationId])
    ]);

    return {
      items: itemsResult.rows,
      total: totalResult.rows[0].total as number
    };
  }

  async create(input: CreateClientInput) {
    const result = await pool.query(
      `INSERT INTO clients (organization_id, name, company_name, nif, address, email, phone, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, company_name, nif, address, email, phone, notes, created_at`,
      [
        input.organizationId,
        input.name,
        input.company_name ?? null,
        input.nif ?? null,
        input.address ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.notes ?? null
      ]
    );
    return result.rows[0];
  }

  async update(input: UpdateClientInput) {
    const result = await pool.query(
      `UPDATE clients
       SET name = $1,
           company_name = $2,
           nif = $3,
           address = $4,
           email = $5,
           phone = $6,
           notes = $7,
           updated_at = NOW()
       WHERE id = $8 AND organization_id = $9
       RETURNING id, name, company_name, nif, address, email, phone, notes, updated_at`,
      [
        input.name,
        input.company_name ?? null,
        input.nif ?? null,
        input.address ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.notes ?? null,
        input.clientId,
        input.organizationId
      ]
    );
    return result.rows[0] ?? null;
  }
}
