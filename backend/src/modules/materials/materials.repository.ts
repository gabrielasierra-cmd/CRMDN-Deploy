import { pool } from "../../db/pool";
import { Pagination } from "../shared/pagination";
import { MaterialMovementType, MaterialStatus } from "./materials.schemas";

function toNumber(value: string | number | null | undefined): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function normalizeStatusFilter(status?: MaterialStatus): string | null {
  if (!status) return null;
  return status;
}

export class MaterialsRepository {
  private statusCaseSql(alias = "m"): string {
    return `CASE
      WHEN ${alias}.current_stock <= ${alias}.min_stock THEN 'critical'
      WHEN ${alias}.current_stock <= (${alias}.min_stock * 1.5) THEN 'attention'
      ELSE 'normal'
    END`;
  }

  async list(
    organizationId: string,
    pagination: Pagination,
    filter?: { status?: MaterialStatus; sort?: string; category?: string }
  ) {
    const offset = (pagination.page - 1) * pagination.pageSize;
    const params: Array<string | number> = [organizationId];
    const statusExpr = this.statusCaseSql();
    const where: string[] = ["m.organization_id = $1"];

    if (filter?.status) {
      params.push(normalizeStatusFilter(filter.status) as string);
      where.push(`(${statusExpr}) = $${params.length}`);
    }

    if (filter?.category) {
      params.push(filter.category.trim());
      where.push(`m.category = $${params.length}`);
    }

    const sortExpr =
      filter?.sort === "stock_desc"
        ? "m.current_stock DESC, m.min_stock DESC, m.name ASC"
        : filter?.sort === "critical_first"
          ? `${statusExpr} ASC, m.current_stock ASC, m.name ASC`
          : "m.current_stock ASC, m.min_stock ASC, m.name ASC";

    const baseSelect = `
      SELECT
        m.id,
        m.name,
        m.category,
        m.sku,
        m.unit,
        m.current_stock,
        m.min_stock,
        m.unit_cost,
        m.consumo_mensal,
        m.created_at,
        m.updated_at,
        lm.last_movement_at,
        ${statusExpr} AS status,
        CASE
          WHEN m.consumo_mensal > 0 THEN ROUND((m.current_stock / NULLIF((m.consumo_mensal / 30.0), 0))::numeric, 1)
          ELSE NULL
        END AS days_remaining
      FROM materials m
      LEFT JOIN (
        SELECT material_id, MAX(created_at) AS last_movement_at
        FROM stock_movements
        WHERE organization_id = $1
        GROUP BY material_id
      ) lm ON lm.material_id = m.id
      WHERE ${where.join(" AND ")}
    `;

    const itemsResult = await pool.query(
      `${baseSelect}
       ORDER BY ${sortExpr}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pagination.pageSize, offset]
    );

    const totalResult = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM materials m WHERE ${where.join(" AND ")}`,
      params
    );

    const summaryResult = await pool.query<{
      total: number;
      critical_count: number;
      attention_count: number;
      normal_count: number;
      avg_consumption: string | null;
    }>(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE current_stock <= min_stock)::int AS critical_count,
        COUNT(*) FILTER (WHERE current_stock > min_stock AND current_stock <= (min_stock * 1.5))::int AS attention_count,
        COUNT(*) FILTER (WHERE current_stock > (min_stock * 1.5))::int AS normal_count,
        COALESCE(ROUND(AVG(consumo_mensal)::numeric, 2), 0) AS avg_consumption
      FROM materials m
      WHERE ${where.join(" AND ")}
      `,
      params
    );

    return {
      items: itemsResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        sku: row.sku,
        unit: row.unit,
        currentStock: toNumber(row.current_stock),
        minStock: toNumber(row.min_stock),
        unitCost: toNumber(row.unit_cost),
        consumoMensal: toNumber(row.consumo_mensal),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMovementAt: row.last_movement_at,
        status: row.status,
        daysRemaining: row.days_remaining === null ? null : toNumber(row.days_remaining)
      })),
      total: totalResult.rows[0].total,
      summary: {
        totalMaterials: summaryResult.rows[0].total,
        criticalMaterials: summaryResult.rows[0].critical_count,
        attentionMaterials: summaryResult.rows[0].attention_count,
        normalMaterials: summaryResult.rows[0].normal_count,
        averageConsumption: toNumber(summaryResult.rows[0].avg_consumption)
      }
    };
  }

  async create(input: {
    organizationId: string;
    userId: string;
    name: string;
    category?: string;
    sku?: string | null;
    unit?: string;
    currentStock: number;
    minStock: number;
    consumoMensal: number;
    unitCost?: number;
  }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const name = input.name.trim();
      const duplicateByName = await client.query(
        `SELECT id FROM materials WHERE organization_id = $1 AND lower(name) = $2 LIMIT 1`,
        [input.organizationId, name.toLowerCase()]
      );
      if (duplicateByName.rows.length) {
        throw new Error("MATERIAL_ALREADY_EXISTS");
      }

      const normalizedSku = input.sku?.trim() || null;
      if (normalizedSku) {
        const duplicateBySku = await client.query(
          `SELECT id FROM materials WHERE organization_id = $1 AND sku = $2 LIMIT 1`,
          [input.organizationId, normalizedSku]
        );
        if (duplicateBySku.rows.length) {
          throw new Error("MATERIAL_ALREADY_EXISTS");
        }
      }

      const result = await client.query<{
        id: string;
        name: string;
        category: string;
        sku: string | null;
        unit: string;
        current_stock: string;
        min_stock: string;
        unit_cost: string;
        consumo_mensal: string;
        created_at: string;
        updated_at: string;
      }>(
        `
        INSERT INTO materials (
          organization_id, name, category, sku, unit, current_stock, min_stock, unit_cost, consumo_mensal
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, name, category, sku, unit, current_stock, min_stock, unit_cost, consumo_mensal, created_at, updated_at
        `,
        [
          input.organizationId,
          name,
          input.category?.trim() || "Produtos de limpeza",
          normalizedSku,
          input.unit?.trim() || "unit",
          input.currentStock,
          input.minStock,
          input.unitCost ?? 0,
          input.consumoMensal
        ]
      );

      await client.query(
        `INSERT INTO audit_logs (organization_id, user_id, action, entity, entity_id, metadata)
         VALUES ($1, $2, 'CREATE_MATERIAL', 'material', $3, $4::jsonb)`,
        [
          input.organizationId,
          input.userId,
          result.rows[0].id,
          JSON.stringify({
            name,
            category: input.category?.trim() || "Produtos de limpeza",
            sku: normalizedSku,
            unit: input.unit ?? "unit",
            currentStock: input.currentStock,
            minStock: input.minStock,
            consumoMensal: input.consumoMensal,
            unitCost: input.unitCost ?? 0
          })
        ]
      );

      await client.query("COMMIT");
      return {
        id: result.rows[0].id,
        name: result.rows[0].name,
        category: result.rows[0].category,
        sku: result.rows[0].sku,
        unit: result.rows[0].unit,
        currentStock: toNumber(result.rows[0].current_stock),
        minStock: toNumber(result.rows[0].min_stock),
        unitCost: toNumber(result.rows[0].unit_cost),
        consumoMensal: toNumber(result.rows[0].consumo_mensal),
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at,
        status:
          toNumber(result.rows[0].current_stock) <= toNumber(result.rows[0].min_stock)
            ? "critical"
            : toNumber(result.rows[0].current_stock) <= toNumber(result.rows[0].min_stock) * 1.5
              ? "attention"
              : "normal"
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createMovement(input: {
    organizationId: string;
    userId: string;
    materialId: string;
    type: MaterialMovementType;
    quantity: number;
    note?: string | null;
  }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const materialResult = await client.query<{
        id: string;
        name: string;
        current_stock: string;
        min_stock: string;
      }>(
        `SELECT id, name, current_stock, min_stock
         FROM materials
         WHERE organization_id = $1 AND id = $2
         FOR UPDATE`,
        [input.organizationId, input.materialId]
      );

      if (!materialResult.rows.length) {
        throw new Error("MATERIAL_NOT_FOUND");
      }

      const material = materialResult.rows[0];
      const currentStock = toNumber(material.current_stock);
      let nextStock = currentStock;

      if (input.type === "IN") {
        nextStock = +(currentStock + input.quantity).toFixed(3);
      } else if (input.type === "OUT") {
        nextStock = +(currentStock - input.quantity).toFixed(3);
        if (nextStock < 0) {
          throw new Error("INSUFFICIENT_STOCK");
        }
      } else {
        nextStock = +(input.quantity).toFixed(3);
      }

      await client.query(
        `UPDATE materials
         SET current_stock = $3::numeric(14,3),
             updated_at = NOW()
         WHERE organization_id = $1 AND id = $2`,
        [input.organizationId, input.materialId, nextStock]
      );

      const movementResult = await client.query<{
        id: string;
        material_id: string;
        type: string;
        quantity: string;
        note: string | null;
        created_at: string;
      }>(
        `INSERT INTO stock_movements (
           organization_id, material_id, type, quantity, note, created_by
         )
         VALUES ($1, $2, $3::stock_movement_type, $4, $5, $6)
         RETURNING id, material_id, type, quantity, note, created_at`,
        [input.organizationId, input.materialId, input.type, input.quantity, input.note ?? null, input.userId]
      );

      await client.query(
        `INSERT INTO audit_logs (organization_id, user_id, action, entity, entity_id, metadata)
         VALUES ($1, $2, 'STOCK_MOVEMENT', 'material', $3, $4::jsonb)`,
        [
          input.organizationId,
          input.userId,
          input.materialId,
          JSON.stringify({
            type: input.type,
            quantity: input.quantity,
            note: input.note ?? null,
            nextStock
          })
        ]
      );

      await client.query("COMMIT");

      return {
        id: movementResult.rows[0].id,
        materialId: movementResult.rows[0].material_id,
        type: movementResult.rows[0].type,
        quantity: toNumber(movementResult.rows[0].quantity),
        note: movementResult.rows[0].note,
        createdAt: movementResult.rows[0].created_at,
        stockAfter: nextStock,
        materialName: material.name
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async history(organizationId: string, pagination: Pagination, materialId?: string) {
    const offset = (pagination.page - 1) * pagination.pageSize;
    const params: Array<string | number> = [organizationId];
    let materialFilter = "";

    if (materialId) {
      params.push(materialId);
      materialFilter = `AND sm.material_id = $2`;
    }

    const itemsResult = await pool.query(
      `
      SELECT
        sm.id,
        sm.material_id,
        m.name AS material_name,
        sm.type,
        sm.quantity,
        sm.note,
        sm.created_at
      FROM stock_movements sm
      JOIN materials m ON m.id = sm.material_id
      WHERE sm.organization_id = $1
      ${materialFilter}
      ORDER BY sm.created_at DESC, sm.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, pagination.pageSize, offset]
    );

    const totalResult = await pool.query<{ total: number }>(
      `
      SELECT COUNT(*)::int AS total
      FROM stock_movements sm
      WHERE sm.organization_id = $1
      ${materialFilter}
      `,
      params
    );

    return {
      items: itemsResult.rows.map((row) => ({
        id: row.id,
        materialId: row.material_id,
        materialName: row.material_name,
        type: row.type,
        quantity: toNumber(row.quantity),
        note: row.note,
        createdAt: row.created_at
      })),
      total: totalResult.rows[0].total
    };
  }
}
