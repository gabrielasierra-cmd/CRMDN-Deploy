import { pool } from "../../db/pool";
import { Pagination } from "../shared/pagination";

type WorkHourFilters = {
  employeeId?: string;
  local?: string;
  startDate?: string;
  endDate?: string;
};

function parseNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export class WorkHoursRepository {
  private buildWhere(organizationId: string, filters: WorkHourFilters) {
    const clauses = ["rh.organization_id = $1"];
    const params: unknown[] = [organizationId];

    if (filters.employeeId) {
      params.push(filters.employeeId);
      clauses.push(`rh.id_trabalhador = $${params.length}`);
    }

    if (filters.local) {
      params.push(`%${filters.local.trim().toLowerCase()}%`);
      clauses.push(`lower(rh.local_trabalho) LIKE $${params.length}`);
    }

    if (filters.startDate) {
      params.push(filters.startDate);
      clauses.push(`rh.data >= $${params.length}`);
    }

    if (filters.endDate) {
      params.push(filters.endDate);
      clauses.push(`rh.data <= $${params.length}`);
    }

    return { where: clauses.join(" AND "), params };
  }

  private async findById(organizationId: string, recordId: string) {
    const result = await pool.query(
      `SELECT
         rh.id,
         rh.organization_id,
         rh.id_trabalhador,
         rh.data,
         rh.horas_trabalhadas,
         rh.local_trabalho,
         rh.created_at,
         rh.updated_at,
         e.full_name AS trabalhador_nome,
         e.email AS trabalhador_email,
         e.phone AS trabalhador_telefone
       FROM registo_horas rh
       JOIN employees e ON e.id = rh.id_trabalhador
       WHERE rh.id = $1
         AND rh.organization_id = $2
       LIMIT 1`,
      [recordId, organizationId]
    );
    return result.rows[0] || null;
  }

  async list(organizationId: string, pagination: Pagination & WorkHourFilters) {
    const { where, params } = this.buildWhere(organizationId, pagination);
    const offset = (pagination.page - 1) * pagination.pageSize;
    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;

    const [items, total] = await Promise.all([
      pool.query(
        `SELECT
           rh.id,
           rh.organization_id,
           rh.id_trabalhador,
           rh.data,
           rh.horas_trabalhadas,
           rh.local_trabalho,
           rh.created_at,
           rh.updated_at,
           e.full_name AS trabalhador_nome,
           e.email AS trabalhador_email,
           e.phone AS trabalhador_telefone
         FROM registo_horas rh
         JOIN employees e ON e.id = rh.id_trabalhador
         WHERE ${where}
         ORDER BY rh.data DESC, rh.created_at DESC, e.full_name ASC
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        [...params, pagination.pageSize, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM registo_horas rh WHERE ${where}`, params)
    ]);

    return { items: items.rows, total: total.rows[0].total as number };
  }

  async stats(organizationId: string, filters: WorkHourFilters) {
    const { where, params } = this.buildWhere(organizationId, filters);

    const [summaryResult, workerResult, localResult, heatmapResult] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(rh.horas_trabalhadas), 0)::numeric AS total_hours,
           COUNT(*)::int AS total_records
         FROM registo_horas rh
         WHERE ${where}`,
        params
      ),
      pool.query(
        `SELECT
           rh.id_trabalhador,
           e.full_name AS trabalhador_nome,
           COUNT(*)::int AS total_registos,
           COALESCE(SUM(rh.horas_trabalhadas), 0)::numeric AS total_horas
         FROM registo_horas rh
         JOIN employees e ON e.id = rh.id_trabalhador
         WHERE ${where}
         GROUP BY rh.id_trabalhador, e.full_name
         ORDER BY total_horas DESC, total_registos DESC, trabalhador_nome ASC`,
        params
      ),
      pool.query(
        `SELECT
           rh.local_trabalho,
           COUNT(*)::int AS total_registos,
           COALESCE(SUM(rh.horas_trabalhadas), 0)::numeric AS total_horas
         FROM registo_horas rh
         WHERE ${where}
         GROUP BY rh.local_trabalho
         ORDER BY total_horas DESC, total_registos DESC, rh.local_trabalho ASC`,
        params
      ),
      pool.query(
        `SELECT
           rh.id_trabalhador,
           e.full_name AS trabalhador_nome,
           rh.local_trabalho,
           COUNT(*)::int AS total_registos,
           COALESCE(SUM(rh.horas_trabalhadas), 0)::numeric AS total_horas
         FROM registo_horas rh
         JOIN employees e ON e.id = rh.id_trabalhador
         WHERE ${where}
         GROUP BY rh.id_trabalhador, e.full_name, rh.local_trabalho
         ORDER BY total_horas DESC, total_registos DESC, trabalhador_nome ASC, rh.local_trabalho ASC`,
        params
      )
    ]);

    const summaryRow = summaryResult.rows[0] || {};
    const workerTotals = workerResult.rows.map((row) => ({
      employeeId: row.id_trabalhador,
      employeeName: row.trabalhador_nome,
      totalRecords: Number(row.total_registos || 0),
      totalHours: parseNumber(row.total_horas)
    }));
    const locationTotals = localResult.rows.map((row) => ({
      localTrabalho: row.local_trabalho,
      totalRecords: Number(row.total_registos || 0),
      totalHours: parseNumber(row.total_horas)
    }));
    const heatmap = heatmapResult.rows.map((row) => ({
      employeeId: row.id_trabalhador,
      employeeName: row.trabalhador_nome,
      localTrabalho: row.local_trabalho,
      totalRecords: Number(row.total_registos || 0),
      totalHours: parseNumber(row.total_horas)
    }));

    return {
      summary: {
        totalHours: parseNumber(summaryRow.total_hours),
        totalRecords: Number(summaryRow.total_records || 0),
        workerCount: workerTotals.length,
        locationCount: locationTotals.length
      },
      workerTotals,
      locationTotals,
      heatmap
    };
  }

  async create(input: {
    organizationId: string;
    employeeId: string;
    data: string;
    horasTrabalhadas: number;
    localTrabalho: string;
  }) {
    const employeeResult = await pool.query(
      `SELECT id
       FROM employees
       WHERE id = $1
         AND organization_id = $2
       LIMIT 1`,
      [input.employeeId, input.organizationId]
    );

    if (!employeeResult.rows.length) {
      return null;
    }

    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO registo_horas (
         organization_id,
         id_trabalhador,
         data,
         horas_trabalhadas,
         local_trabalho
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.organizationId, input.employeeId, input.data, input.horasTrabalhadas, input.localTrabalho]
    );

    return this.findById(input.organizationId, inserted.rows[0].id);
  }

  async update(input: {
    organizationId: string;
    recordId: string;
    employeeId?: string;
    data?: string;
    horasTrabalhadas?: number;
    localTrabalho?: string;
  }) {
    const existing = await this.findById(input.organizationId, input.recordId);
    if (!existing) {
      return null;
    }

    const nextEmployeeId = input.employeeId ?? existing.id_trabalhador;
    if (input.employeeId) {
      const employeeResult = await pool.query(
        `SELECT id
         FROM employees
         WHERE id = $1
           AND organization_id = $2
         LIMIT 1`,
        [input.employeeId, input.organizationId]
      );
      if (!employeeResult.rows.length) {
        return null;
      }
    }

    const nextData = input.data ?? existing.data;
    const nextHoras = input.horasTrabalhadas ?? parseNumber(existing.horas_trabalhadas);
    const nextLocal = input.localTrabalho ?? existing.local_trabalho;

    await pool.query(
      `UPDATE registo_horas
       SET id_trabalhador = $1,
           data = $2,
           horas_trabalhadas = $3,
           local_trabalho = $4,
           updated_at = NOW()
       WHERE id = $5
         AND organization_id = $6`,
      [nextEmployeeId, nextData, nextHoras, nextLocal, input.recordId, input.organizationId]
    );

    return this.findById(input.organizationId, input.recordId);
  }

  async delete(input: { organizationId: string; recordId: string }) {
    const existing = await this.findById(input.organizationId, input.recordId);
    if (!existing) {
      return null;
    }

    await pool.query(
      `DELETE FROM registo_horas
       WHERE id = $1
         AND organization_id = $2`,
      [input.recordId, input.organizationId]
    );

    return existing;
  }
}
