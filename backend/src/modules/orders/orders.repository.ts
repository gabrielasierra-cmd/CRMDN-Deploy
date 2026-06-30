import { pool } from "../../db/pool";
import { Pagination } from "../shared/pagination";

export class OrdersRepository {
  async list(organizationId: string, pagination: Pagination) {
    const offset = (pagination.page - 1) * pagination.pageSize;

    const [items, total] = await Promise.all([
      pool.query(
        `SELECT o.id, o.status, o.scheduled_at, o.total_amount, o.notes, o.created_at,
                c.id as client_id, c.name as client_name,
                s.id as service_id, s.name as service_name,
                e.id as employee_id, e.full_name as employee_name
         FROM orders o
         JOIN clients c ON c.id = o.client_id
         JOIN services s ON s.id = o.service_id
         LEFT JOIN employees e ON e.id = o.employee_id
         WHERE o.organization_id = $1
         ORDER BY o.scheduled_at DESC
         LIMIT $2 OFFSET $3`,
        [organizationId, pagination.pageSize, offset]
      ),
      pool.query(`SELECT COUNT(*)::int as total FROM orders WHERE organization_id = $1`, [organizationId])
    ]);

    return {
      items: items.rows,
      total: total.rows[0].total as number
    };
  }

  async create(input: {
    organizationId: string;
    clientId: string;
    serviceId: string;
    employeeId?: string;
    scheduledAt: string;
    notes?: string;
  }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const serviceResult = await client.query<{ price: string }>(
        `SELECT price FROM services WHERE id = $1 AND organization_id = $2`,
        [input.serviceId, input.organizationId]
      );

      if (!serviceResult.rows.length) {
        throw new Error("Service not found");
      }

      const totalAmount = Number(serviceResult.rows[0].price);

      const orderResult = await client.query(
        `INSERT INTO orders (
           organization_id, client_id, service_id, employee_id, scheduled_at, status, total_amount, notes
         ) VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, $7)
         RETURNING id, status, scheduled_at, total_amount, notes, created_at`,
        [
          input.organizationId,
          input.clientId,
          input.serviceId,
          input.employeeId ?? null,
          input.scheduledAt,
          totalAmount,
          input.notes ?? null
        ]
      );

      await client.query("COMMIT");
      return orderResult.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
