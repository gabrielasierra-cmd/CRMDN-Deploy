import { PoolClient } from "pg";
import { pool } from "../../db/pool";
import { Pagination } from "../shared/pagination";
import { AuditRepository } from "../audit/audit.repository";

interface AllocationSettings {
  sociosPercentage: number;
  investimentosPercentage: number;
  emergenciasPercentage: number;
  basePercentage: number;
}

interface FinancialAllocationValues {
  totalAmount: number;
  sociosAmount: number;
  investimentosAmount: number;
  emergenciasAmount: number;
  baseAmount: number;
}

type DashboardPeriod = "all" | "month" | "last3months" | "custom";

interface DashboardFilter {
  period?: DashboardPeriod;
  startDate?: string;
  endDate?: string;
}

interface DashboardResolvedRange {
  start: Date;
  endExclusive?: Date;
}

const FINANCIAL_ALLOCATIONS_START_ISO = "2025-10-01T00:00:00.000Z";

function toNumber(value: string | number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function maxDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function monthStartUtc(reference: Date): Date {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0));
}

function parseCustomDateStartUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseCustomDateEndExclusiveUtc(value: string): Date {
  const end = new Date(`${value}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

function resolveDashboardRange(filter: DashboardFilter | undefined): DashboardResolvedRange {
  const allocationsStart = new Date(FINANCIAL_ALLOCATIONS_START_ISO);
  const period = filter?.period ?? "all";
  const now = new Date();

  if (period === "month") {
    return {
      start: maxDate(monthStartUtc(now), allocationsStart)
    };
  }

  if (period === "last3months") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1, 0, 0, 0, 0));
    return {
      start: maxDate(start, allocationsStart)
    };
  }

  if (period === "custom" && filter?.startDate && filter?.endDate) {
    return {
      start: maxDate(parseCustomDateStartUtc(filter.startDate), allocationsStart),
      endExclusive: parseCustomDateEndExclusiveUtc(filter.endDate)
    };
  }

  return { start: allocationsStart };
}

function distributeAmount(totalAmount: number, settings: AllocationSettings): FinancialAllocationValues {
  const safeTotal = Math.max(0, Number(totalAmount.toFixed(2)));
  const totalCents = Math.round(safeTotal * 100);

  const ratios = [
    { key: "sociosAmount", percentage: settings.sociosPercentage },
    { key: "investimentosAmount", percentage: settings.investimentosPercentage },
    { key: "emergenciasAmount", percentage: settings.emergenciasPercentage },
    { key: "baseAmount", percentage: settings.basePercentage }
  ] as const;

  const calculated = ratios.map((item) => {
    const rawCents = (totalCents * item.percentage) / 100;
    const floorCents = Math.floor(rawCents);
    return {
      key: item.key,
      floorCents,
      fraction: rawCents - floorCents
    };
  });

  const distributed = Object.fromEntries(calculated.map((item) => [item.key, item.floorCents])) as Record<
    "sociosAmount" | "investimentosAmount" | "emergenciasAmount" | "baseAmount",
    number
  >;

  let remaining = totalCents - calculated.reduce((acc, item) => acc + item.floorCents, 0);
  if (remaining > 0) {
    const byFraction = [...calculated].sort((a, b) => b.fraction - a.fraction);
    for (let i = 0; i < byFraction.length && remaining > 0; i += 1) {
      distributed[byFraction[i].key] += 1;
      remaining -= 1;
    }
  }

  return {
    totalAmount: safeTotal,
    sociosAmount: distributed.sociosAmount / 100,
    investimentosAmount: distributed.investimentosAmount / 100,
    emergenciasAmount: distributed.emergenciasAmount / 100,
    baseAmount: distributed.baseAmount / 100
  };
}

export class FinancialRepository {
  private readonly auditRepository = new AuditRepository();

  private async ensureAllocationSettingsTx(client: PoolClient, organizationId: string): Promise<AllocationSettings> {
    await client.query(
      `INSERT INTO allocation_settings (organization_id)
       VALUES ($1)
       ON CONFLICT (organization_id) DO NOTHING`,
      [organizationId]
    );

    const settingsResult = await client.query<{
      socios_percentage: string;
      investimentos_percentage: string;
      emergencias_percentage: string;
      base_percentage: string;
    }>(
      `SELECT socios_percentage, investimentos_percentage, emergencias_percentage, base_percentage
       FROM allocation_settings
       WHERE organization_id = $1`,
      [organizationId]
    );

    const row = settingsResult.rows[0];
    return {
      sociosPercentage: toNumber(row?.socios_percentage),
      investimentosPercentage: toNumber(row?.investimentos_percentage),
      emergenciasPercentage: toNumber(row?.emergencias_percentage),
      basePercentage: toNumber(row?.base_percentage)
    };
  }

  async createAllocationForPaymentTx(input: {
    client: PoolClient;
    organizationId: string;
    paymentId: string;
    paymentAmount: number;
    userId?: string;
  }): Promise<{ allocationId?: string; created: boolean }> {
    const result = await this.replaceAllocationForPaymentTx(input);
    return { allocationId: result.allocationId, created: result.created };
  }

  async replaceAllocationForPaymentTx(input: {
    client: PoolClient;
    organizationId: string;
    paymentId: string;
    paymentAmount: number;
    userId?: string;
  }): Promise<{ allocationId?: string; created: boolean; updated: boolean }> {
    const settings = await this.ensureAllocationSettingsTx(input.client, input.organizationId);
    const values = distributeAmount(input.paymentAmount, settings);

    const existingResult = await input.client.query<{ id: string }>(
      `SELECT id
       FROM financial_allocations
       WHERE organization_id = $1
         AND payment_id = $2
       LIMIT 1`,
      [input.organizationId, input.paymentId]
    );

    if (existingResult.rows.length) {
      const allocationId = existingResult.rows[0].id;
      await input.client.query(
        `UPDATE financial_allocations
         SET total_amount = $1,
             socios_amount = $2,
             investimentos_amount = $3,
             emergencias_amount = $4,
             base_amount = $5,
             reversed = FALSE
         WHERE id = $6`,
        [
          values.totalAmount,
          values.sociosAmount,
          values.investimentosAmount,
          values.emergenciasAmount,
          values.baseAmount,
          allocationId
        ]
      );

      await this.auditRepository.createTx(input.client, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "UPDATE_ALLOCATION",
        entity: "financial_allocation",
        entityId: allocationId,
        metadata: {
          paymentId: input.paymentId,
          totalAmount: values.totalAmount,
          sociosAmount: values.sociosAmount,
          investimentosAmount: values.investimentosAmount,
          emergenciasAmount: values.emergenciasAmount,
          baseAmount: values.baseAmount,
          settings
        }
      });

      return { allocationId, created: false, updated: true };
    }

    const allocationResult = await input.client.query<{ id: string }>(
      `INSERT INTO financial_allocations (
         organization_id,
         payment_id,
         total_amount,
         socios_amount,
         investimentos_amount,
         emergencias_amount,
         base_amount
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (payment_id) DO NOTHING
       RETURNING id`,
      [
        input.organizationId,
        input.paymentId,
        values.totalAmount,
        values.sociosAmount,
        values.investimentosAmount,
        values.emergenciasAmount,
        values.baseAmount
      ]
    );

    const created = allocationResult.rows.length > 0;
    const allocationId = allocationResult.rows[0]?.id;

    if (created) {
      await this.auditRepository.createTx(input.client, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "CREATE_ALLOCATION",
        entity: "financial_allocation",
        entityId: allocationId,
        metadata: {
          paymentId: input.paymentId,
          totalAmount: values.totalAmount,
          sociosAmount: values.sociosAmount,
          investimentosAmount: values.investimentosAmount,
          emergenciasAmount: values.emergenciasAmount,
          baseAmount: values.baseAmount,
          settings
        }
      });
    }

    return { allocationId, created, updated: false };
  }

  async createAllocationForPayment(input: {
    organizationId: string;
    paymentId: string;
    paymentAmount: number;
    userId?: string;
  }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.createAllocationForPaymentTx({
        client,
        organizationId: input.organizationId,
        paymentId: input.paymentId,
        paymentAmount: input.paymentAmount,
        userId: input.userId
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async reverseAllocation(input: {
    organizationId: string;
    userId: string;
    paymentId: string;
    reason?: string;
  }): Promise<{ paymentId: string; reversed: boolean; alreadyReversed: boolean; allocationId: string }> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const allocationResult = await client.query<{ id: string; reversed: boolean }>(
        `SELECT fa.id, fa.reversed
         FROM financial_allocations fa
         WHERE fa.organization_id = $1
           AND fa.payment_id = $2
         LIMIT 1`,
        [input.organizationId, input.paymentId]
      );

      if (!allocationResult.rows.length) {
        throw new Error("ALLOCATION_NOT_FOUND");
      }

      const allocation = allocationResult.rows[0];
      if (allocation.reversed) {
        await client.query("COMMIT");
        return {
          paymentId: input.paymentId,
          allocationId: allocation.id,
          reversed: true,
          alreadyReversed: true
        };
      }

      await client.query(
        `UPDATE financial_allocations
         SET reversed = TRUE
         WHERE id = $1`,
        [allocation.id]
      );

      await this.auditRepository.createTx(client, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "REVERSE_ALLOCATION",
        entity: "financial_allocation",
        entityId: allocation.id,
        metadata: {
          paymentId: input.paymentId,
          reason: input.reason ?? null
        }
      });

      await client.query("COMMIT");
      return {
        paymentId: input.paymentId,
        allocationId: allocation.id,
        reversed: true,
        alreadyReversed: false
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getSummary(organizationId: string) {
    const [totalsResult, settingsResult] = await Promise.all([
      pool.query<{
        total_amount: string | null;
        socios_amount: string | null;
        investimentos_amount: string | null;
        emergencias_amount: string | null;
        base_amount: string | null;
      }>(
        `SELECT
           COALESCE(SUM(total_amount), 0)::text as total_amount,
           COALESCE(SUM(socios_amount), 0)::text as socios_amount,
           COALESCE(SUM(investimentos_amount), 0)::text as investimentos_amount,
           COALESCE(SUM(emergencias_amount), 0)::text as emergencias_amount,
           COALESCE(SUM(base_amount), 0)::text as base_amount
         FROM financial_allocations
         WHERE organization_id = $1
           AND reversed = FALSE`,
        [organizationId]
      ),
      pool.query<{
        socios_percentage: string;
        investimentos_percentage: string;
        emergencias_percentage: string;
        base_percentage: string;
      }>(
        `SELECT socios_percentage, investimentos_percentage, emergencias_percentage, base_percentage
         FROM allocation_settings
         WHERE organization_id = $1`,
        [organizationId]
      )
    ]);

    const totals = totalsResult.rows[0];
    const settings = settingsResult.rows[0];

    const payload = {
      total: toNumber(totals.total_amount),
      socios: toNumber(totals.socios_amount),
      investimentos: toNumber(totals.investimentos_amount),
      emergencias: toNumber(totals.emergencias_amount),
      base: toNumber(totals.base_amount)
    };

    return {
      ...payload,
      totals: {
        totalAmount: payload.total,
        sociosAmount: payload.socios,
        investimentosAmount: payload.investimentos,
        emergenciasAmount: payload.emergencias,
        baseAmount: payload.base
      },
      settings: settings
        ? {
            sociosPercentage: toNumber(settings.socios_percentage),
            investimentosPercentage: toNumber(settings.investimentos_percentage),
            emergenciasPercentage: toNumber(settings.emergencias_percentage),
            basePercentage: toNumber(settings.base_percentage)
          }
        : null
    };
  }

  async getDashboard(organizationId: string, filter?: DashboardFilter) {
    const range = resolveDashboardRange(filter);

    const [totalFaturadoResult, receitasResult, despesasResult, salariosResult] = await Promise.all([
      pool.query<{ total_faturado: string | null }>(
        `SELECT COALESCE(SUM(p.amount), 0)::text AS total_faturado
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE o.organization_id = $1`,
        [organizationId]
      ),
      range.endExclusive
        ? pool.query<{ receitas_consideradas: string | null }>(
            `SELECT COALESCE(SUM(total_amount), 0)::text AS receitas_consideradas
             FROM financial_allocations
             WHERE organization_id = $1
               AND reversed = FALSE
               AND created_at >= $2
               AND created_at < $3`,
            [organizationId, range.start.toISOString(), range.endExclusive.toISOString()]
          )
        : pool.query<{ receitas_consideradas: string | null }>(
            `SELECT COALESCE(SUM(total_amount), 0)::text AS receitas_consideradas
             FROM financial_allocations
             WHERE organization_id = $1
               AND reversed = FALSE
               AND created_at >= $2`,
            [organizationId, range.start.toISOString()]
          ),
      range.endExclusive
        ? pool.query<{ total_despesas: string | null }>(
            `SELECT COALESCE(SUM(amount), 0)::text AS total_despesas
             FROM expenses
             WHERE organization_id = $1
               AND expense_date >= $2::date
               AND expense_date < $3::date`,
            [organizationId, range.start.toISOString(), range.endExclusive.toISOString()]
          )
        : pool.query<{ total_despesas: string | null }>(
            `SELECT COALESCE(SUM(amount), 0)::text AS total_despesas
             FROM expenses
             WHERE organization_id = $1
               AND expense_date >= $2::date`,
            [organizationId, range.start.toISOString()]
          ),
      range.endExclusive
        ? pool.query<{ total_salarios: string | null }>(
            `SELECT COALESCE(SUM(net_amount), 0)::text AS total_salarios
             FROM salaries
             WHERE organization_id = $1
               AND period_month >= $2::date
               AND period_month < $3::date`,
            [organizationId, range.start.toISOString(), range.endExclusive.toISOString()]
          )
        : pool.query<{ total_salarios: string | null }>(
            `SELECT COALESCE(SUM(net_amount), 0)::text AS total_salarios
             FROM salaries
             WHERE organization_id = $1
               AND period_month >= $2::date`,
            [organizationId, range.start.toISOString()]
          )
    ]);

    const totalFaturado = toNumber(totalFaturadoResult.rows[0]?.total_faturado);
    const receitasConsideradas = toNumber(receitasResult.rows[0]?.receitas_consideradas);
    const totalDespesas = toNumber(despesasResult.rows[0]?.total_despesas);
    const totalSalarios = toNumber(salariosResult.rows[0]?.total_salarios);

    return {
      totalFaturado,
      receitasConsideradas,
      totalDespesas,
      totalSalarios,
      saldoAtual: receitasConsideradas - totalDespesas - totalSalarios
    };
  }

  async getHistory(organizationId: string, pagination: Pagination) {
    const offset = (pagination.page - 1) * pagination.pageSize;

    const [itemsResult, totalResult] = await Promise.all([
      pool.query<{
        id: string;
        payment_id: string;
        total_amount: string;
        socios_amount: string;
        investimentos_amount: string;
        emergencias_amount: string;
        base_amount: string;
        reversed: boolean;
        created_at: string;
        paid_at: string;
        method: string;
        reference: string | null;
      }>(
        `SELECT
           fa.id,
           fa.payment_id,
           fa.total_amount,
           fa.socios_amount,
           fa.investimentos_amount,
           fa.emergencias_amount,
           fa.base_amount,
           fa.reversed,
           fa.created_at,
           p.paid_at,
           p.method,
           p.reference
         FROM financial_allocations fa
         JOIN payments p ON p.id = fa.payment_id
         JOIN orders o ON o.id = p.order_id
         WHERE o.organization_id = $1
         ORDER BY fa.created_at DESC
         LIMIT $2 OFFSET $3`,
        [organizationId, pagination.pageSize, offset]
      ),
      pool.query<{ total: number }>(
        `SELECT COUNT(*)::int as total
         FROM financial_allocations fa
         JOIN payments p ON p.id = fa.payment_id
         JOIN orders o ON o.id = p.order_id
         WHERE o.organization_id = $1`,
        [organizationId]
      )
    ]);

    return {
      items: itemsResult.rows.map((row) => ({
        id: row.id,
        paymentId: row.payment_id,
        totalAmount: toNumber(row.total_amount),
        sociosAmount: toNumber(row.socios_amount),
        investimentosAmount: toNumber(row.investimentos_amount),
        emergenciasAmount: toNumber(row.emergencias_amount),
        baseAmount: toNumber(row.base_amount),
        reversed: !!row.reversed,
        status: row.reversed ? "revertido" : "ativo",
        createdAt: row.created_at,
        payment: {
          paidAt: row.paid_at,
          method: row.method,
          reference: row.reference
        }
      })),
      total: totalResult.rows[0].total
    };
  }

  async getExpenses(organizationId: string, pagination: Pagination) {
    const offset = (pagination.page - 1) * pagination.pageSize;

    const [itemsResult, totalResult] = await Promise.all([
      pool.query<{
        id: string;
        category: string;
        description: string | null;
        amount: string;
        expense_date: string;
        created_at: string;
      }>(
        `SELECT
           e.id,
           e.category,
           e.description,
           e.amount,
           e.expense_date,
           e.created_at
         FROM expenses e
         WHERE e.organization_id = $1
         ORDER BY e.expense_date DESC, e.created_at DESC
         LIMIT $2 OFFSET $3`,
        [organizationId, pagination.pageSize, offset]
      ),
      pool.query<{ total: number }>(
        `SELECT COUNT(*)::int as total
         FROM expenses e
         WHERE e.organization_id = $1`,
        [organizationId]
      )
    ]);

    return {
      items: itemsResult.rows.map((row) => ({
        id: row.id,
        category: row.category,
        description: row.description,
        amount: toNumber(row.amount),
        expenseDate: row.expense_date,
        createdAt: row.created_at
      })),
      total: totalResult.rows[0].total
    };
  }

  async createExpense(input: {
    organizationId: string;
    userId: string;
    expenseDate: string;
    product: string;
    supplier?: string;
    invoiceNo?: string;
    price: number;
    quantity: number;
    presentation?: string;
    responsible?: string;
    notes?: string;
  }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const amount = Number((Number(input.price) * Number(input.quantity)).toFixed(2));
      const descriptionParts = [];
      if (input.supplier) descriptionParts.push(`Fornecedor: ${input.supplier}`);
      if (input.presentation) descriptionParts.push(`Pagamento: ${input.presentation}`);
      if (input.invoiceNo) descriptionParts.push(`Fatura: ${input.invoiceNo}`);
      if (input.responsible) descriptionParts.push(`Responsavel: ${input.responsible}`);
      if (input.notes) descriptionParts.push(`Notas: ${input.notes}`);
      const description = descriptionParts.join(" | ") || null;

      const result = await client.query<{
        id: string;
        category: string;
        description: string | null;
        amount: string;
        expense_date: string;
        created_at: string;
      }>(
        `INSERT INTO expenses (organization_id, category, description, amount, expense_date, created_by)
         VALUES ($1, $2, $3, $4, $5::date, $6)
         RETURNING id, category, description, amount, expense_date, created_at`,
        [input.organizationId, input.product, description, amount, input.expenseDate, input.userId]
      );

      const row = result.rows[0];
      await this.auditRepository.createTx(client, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "CREATE_EXPENSE",
        entity: "expense",
        entityId: row.id,
        metadata: {
          product: input.product,
          supplier: input.supplier ?? "",
          invoiceNo: input.invoiceNo ?? "",
          price: input.price,
          quantity: input.quantity,
          amount,
          expenseDate: input.expenseDate,
          presentation: input.presentation ?? "",
          responsible: input.responsible ?? "",
          notes: input.notes ?? ""
        }
      });

      await client.query("COMMIT");

      return {
        id: row.id,
        category: row.category,
        description: row.description,
        amount: toNumber(row.amount),
        expenseDate: row.expense_date,
        createdAt: row.created_at
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteExpense(input: { organizationId: string; userId: string; expenseId: string }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query<{
        id: string;
        category: string;
        description: string | null;
        amount: string;
        expense_date: string;
      }>(
        `SELECT id, category, description, amount, expense_date
         FROM expenses
         WHERE organization_id = $1 AND id = $2
         LIMIT 1`,
        [input.organizationId, input.expenseId]
      );

      if (!existing.rows.length) {
        throw new Error("EXPENSE_NOT_FOUND");
      }

      const row = existing.rows[0];

      await client.query(`DELETE FROM expenses WHERE id = $1`, [input.expenseId]);

      await this.auditRepository.createTx(client, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "DELETE_EXPENSE",
        entity: "expense",
        entityId: row.id,
        metadata: {
          category: row.category,
          description: row.description ?? "",
          amount: toNumber(row.amount),
          expenseDate: row.expense_date
        }
      });

      await client.query("COMMIT");

      return {
        expenseId: input.expenseId,
        deleted: true
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateSettings(input: {
    organizationId: string;
    userId: string;
    sociosPercentage: number;
    investimentosPercentage: number;
    emergenciasPercentage: number;
    basePercentage: number;
  }) {
    const total =
      Number(input.sociosPercentage) +
      Number(input.investimentosPercentage) +
      Number(input.emergenciasPercentage) +
      Number(input.basePercentage);
    if (Math.abs(total - 100) > 0.001) {
      throw new Error("INVALID_PERCENTAGES");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query<{
        id: string;
        socios_percentage: string;
        investimentos_percentage: string;
        emergencias_percentage: string;
        base_percentage: string;
        updated_at: string;
      }>(
        `INSERT INTO allocation_settings (
           organization_id,
           socios_percentage,
           investimentos_percentage,
           emergencias_percentage,
           base_percentage,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (organization_id)
         DO UPDATE SET
           socios_percentage = EXCLUDED.socios_percentage,
           investimentos_percentage = EXCLUDED.investimentos_percentage,
           emergencias_percentage = EXCLUDED.emergencias_percentage,
           base_percentage = EXCLUDED.base_percentage,
           updated_at = NOW()
         RETURNING id, socios_percentage, investimentos_percentage, emergencias_percentage, base_percentage, updated_at`,
        [
          input.organizationId,
          input.sociosPercentage,
          input.investimentosPercentage,
          input.emergenciasPercentage,
          input.basePercentage
        ]
      );

      await this.auditRepository.createTx(client, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "UPDATE_SETTINGS",
        entity: "allocation_settings",
        entityId: result.rows[0].id,
        metadata: {
          sociosPercentage: input.sociosPercentage,
          investimentosPercentage: input.investimentosPercentage,
          emergenciasPercentage: input.emergenciasPercentage,
          basePercentage: input.basePercentage
        }
      });

      await client.query("COMMIT");

      const row = result.rows[0];
      return {
        id: row.id,
        sociosPercentage: toNumber(row.socios_percentage),
        investimentosPercentage: toNumber(row.investimentos_percentage),
        emergenciasPercentage: toNumber(row.emergencias_percentage),
        basePercentage: toNumber(row.base_percentage),
        updatedAt: row.updated_at
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async recalculateAllocations(input: { organizationId: string; userId: string; reason?: string }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const settings = await this.ensureAllocationSettingsTx(client, input.organizationId);

      const paymentsResult = await client.query<{ id: string; amount: string }>(
        `SELECT p.id, p.amount
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         LEFT JOIN financial_allocations fa ON fa.payment_id = p.id
         WHERE o.organization_id = $1
           AND fa.id IS NULL`,
        [input.organizationId]
      );

      let created = 0;
      for (const payment of paymentsResult.rows) {
        const values = distributeAmount(toNumber(payment.amount), settings);
        const insertResult = await client.query(
          `INSERT INTO financial_allocations (
             organization_id,
             payment_id,
             total_amount,
             socios_amount,
             investimentos_amount,
             emergencias_amount,
             base_amount
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (payment_id) DO NOTHING`,
          [
            input.organizationId,
            payment.id,
            values.totalAmount,
            values.sociosAmount,
            values.investimentosAmount,
            values.emergenciasAmount,
            values.baseAmount
          ]
        );

        created += insertResult.rowCount ?? 0;
      }

      await this.auditRepository.createTx(client, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "CREATE_ALLOCATION",
        entity: "financial_allocation",
        metadata: {
          reason: input.reason ?? null,
          paymentsScanned: paymentsResult.rows.length,
          allocationsCreated: created,
          settings
        }
      });

      await client.query("COMMIT");

      return {
        paymentsScanned: paymentsResult.rows.length,
        created
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
