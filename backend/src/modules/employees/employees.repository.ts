import { pool } from "../../db/pool";
import { Pagination } from "../shared/pagination";

const CANONICAL_EMPLOYEES = [
  "Angie S.",
  "Dalila S.",
  "Gabriela S.",
  "Isabel P.",
  "Jairo J.",
  "Jeny S.",
  "Joao P.",
  "Julian F.",
  "Loushiana S.",
  "Narai S.",
  "Paola D.",
  "Patricia S.",
  "Rita",
  "Samuel D.",
  "Sonia C."
];

export class EmployeesRepository {
  async list(organizationId: string, pagination: Pagination) {
    const offset = (pagination.page - 1) * pagination.pageSize;
    const canonicalNames = CANONICAL_EMPLOYEES.map((name) => name.toLowerCase());
    const [items, total] = await Promise.all([
      pool.query(
        `SELECT DISTINCT ON (lower(full_name))
           id, full_name, email, phone, salary_base, hire_date, is_active, created_at
         FROM employees
         WHERE organization_id = $1
           AND lower(full_name) = ANY($2::text[])
         ORDER BY lower(full_name) ASC, created_at DESC, id DESC
         LIMIT $3 OFFSET $4`,
        [organizationId, canonicalNames, pagination.pageSize, offset]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT lower(full_name))::int as total
         FROM employees
         WHERE organization_id = $1
           AND lower(full_name) = ANY($2::text[])`,
        [organizationId, canonicalNames]
      )
    ]);
    return { items: items.rows, total: total.rows[0].total as number };
  }

  async create(input: {
    organizationId: string;
    fullName: string;
    email?: string;
    phone?: string;
    salaryBase?: number;
    hireDate?: string;
  }) {
    const normalizedFullName = input.fullName.trim();
    const existing = await pool.query(
      `SELECT id, full_name, email, phone, salary_base, hire_date, is_active, created_at
       FROM employees
       WHERE organization_id = $1
         AND lower(full_name) = lower($2)
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [input.organizationId, normalizedFullName]
    );
    if (existing.rows.length) {
      return existing.rows[0];
    }

    const result = await pool.query(
      `INSERT INTO employees (organization_id, full_name, email, phone, salary_base, hire_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, email, phone, salary_base, hire_date, is_active, created_at`,
      [
        input.organizationId,
        normalizedFullName,
        input.email ?? null,
        input.phone ?? null,
        input.salaryBase ?? null,
        input.hireDate ?? null
      ]
    );
    return result.rows[0];
  }

  async createVacation(input: { organizationId: string; employeeId: string; startDate: string; endDate: string; reason?: string }) {
    const employeeResult = await pool.query(
      `SELECT id FROM employees WHERE id = $1 AND organization_id = $2`,
      [input.employeeId, input.organizationId]
    );
    if (!employeeResult.rows.length) {
      return null;
    }

    const result = await pool.query(
      `INSERT INTO employee_vacations (employee_id, start_date, end_date, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING id, employee_id, start_date, end_date, reason, created_at`,
      [input.employeeId, input.startDate, input.endDate, input.reason ?? null]
    );
    return result.rows[0];
  }
}
