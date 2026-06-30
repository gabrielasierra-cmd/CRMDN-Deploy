import { pool } from "../../db/pool";
import { Pagination } from "../shared/pagination";

function toNumber(value: string | number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export class SalariesRepository {
  async list(
    organizationId: string,
    pagination: Pagination,
    filter?: { employeeId?: string; periodMonth?: string }
  ) {
    const offset = (pagination.page - 1) * pagination.pageSize;
    const params: Array<string | number> = [organizationId];
    const where: string[] = ["s.organization_id = $1"];

    if (filter?.employeeId) {
      params.push(filter.employeeId);
      where.push(`s.employee_id = $${params.length}`);
    }

    if (filter?.periodMonth) {
      params.push(filter.periodMonth);
      where.push(`s.period_month = $${params.length}::date`);
    }

    const [itemsResult, totalResult] = await Promise.all([
      pool.query(
        `
        SELECT
          s.id,
          s.employee_id,
          e.full_name AS employee_name,
          s.period_month,
          s.base_amount,
          s.bonus_amount,
          s.discount_amount,
          s.net_amount,
          s.created_at
        FROM salaries s
        JOIN employees e ON e.id = s.employee_id
        WHERE ${where.join(" AND ")}
        ORDER BY s.period_month DESC, e.full_name ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `,
        [...params, pagination.pageSize, offset]
      ),
      pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM salaries s
        JOIN employees e ON e.id = s.employee_id
        WHERE ${where.join(" AND ")}
        `,
        params
      )
    ]);

    return {
      items: itemsResult.rows.map((row) => ({
        id: row.id,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        periodMonth: row.period_month,
        baseAmount: toNumber(row.base_amount),
        bonusAmount: toNumber(row.bonus_amount),
        discountAmount: toNumber(row.discount_amount),
        netAmount: toNumber(row.net_amount),
        createdAt: row.created_at
      })),
      total: totalResult.rows[0].total as number
    };
  }
}
