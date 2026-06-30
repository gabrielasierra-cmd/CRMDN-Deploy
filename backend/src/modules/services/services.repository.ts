import { pool } from "../../db/pool";
import { Pagination } from "../shared/pagination";

export class ServicesRepository {
  async list(organizationId: string, pagination: Pagination) {
    const offset = (pagination.page - 1) * pagination.pageSize;
    const [items, total] = await Promise.all([
      pool.query(
        `SELECT id, name, description, duration_minutes, price, is_active, created_at
         FROM services
         WHERE organization_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [organizationId, pagination.pageSize, offset]
      ),
      pool.query(`SELECT COUNT(*)::int as total FROM services WHERE organization_id = $1`, [organizationId])
    ]);

    return {
      items: items.rows,
      total: total.rows[0].total as number
    };
  }

  async create(input: {
    organizationId: string;
    name: string;
    description?: string;
    durationMinutes: number;
    price: number;
  }) {
    const result = await pool.query(
      `INSERT INTO services (organization_id, name, description, duration_minutes, price)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, duration_minutes, price, is_active, created_at`,
      [input.organizationId, input.name, input.description ?? null, input.durationMinutes, input.price]
    );
    return result.rows[0];
  }
}
