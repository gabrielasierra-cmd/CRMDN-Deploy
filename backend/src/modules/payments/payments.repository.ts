import { PoolClient } from "pg";
import { pool } from "../../db/pool";
import { Pagination } from "../shared/pagination";
import { AuditRepository } from "../audit/audit.repository";
import { FinancialRepository } from "../financial/financial.repository";

export class PaymentsRepository {
  private readonly auditRepository = new AuditRepository();
  private readonly financialRepository = new FinancialRepository();

  private async refreshOrderStatusTx(client: PoolClient, orderId: string) {
    const orderResult = await client.query<{ total_amount: string; status: string }>(
      `SELECT total_amount, status
       FROM orders
       WHERE id = $1
       LIMIT 1`,
      [orderId]
    );

    if (!orderResult.rows.length) {
      throw new Error("Order not found");
    }

    const totalPaidResult = await client.query<{ total_paid: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total_paid
       FROM payments
       WHERE order_id = $1`,
      [orderId]
    );

    const totalPaid = Number(totalPaidResult.rows[0]?.total_paid || 0);
    const totalAmount = Number(orderResult.rows[0].total_amount || 0);
    const nextStatus = totalPaid >= totalAmount ? "paid" : "scheduled";

    await client.query(
      `UPDATE orders
       SET status = CASE
         WHEN $2 = 'paid' THEN 'paid'
         WHEN status = 'paid' THEN 'scheduled'
         ELSE status
       END,
           updated_at = NOW()
       WHERE id = $1`,
      [orderId, nextStatus]
    );
  }

  async list(organizationId: string, pagination: Pagination) {
    const offset = (pagination.page - 1) * pagination.pageSize;
    const [items, total] = await Promise.all([
      pool.query(
        `SELECT p.id, p.order_id, p.amount, p.method, p.paid_at, p.reference, p.created_at
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE o.organization_id = $1
         ORDER BY p.paid_at DESC
         LIMIT $2 OFFSET $3`,
        [organizationId, pagination.pageSize, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int as total
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE o.organization_id = $1`,
        [organizationId]
      )
    ]);
    return { items: items.rows, total: total.rows[0].total as number };
  }

  async create(input: {
    organizationId: string;
    userId: string;
    orderId: string;
    amount: number;
    method: "cash" | "card" | "transfer" | "mbway";
    paidAt?: string;
    reference?: string;
  }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const orderResult = await client.query<{ id: string; total_amount: string }>(
        `SELECT id, total_amount FROM orders WHERE id = $1 AND organization_id = $2`,
        [input.orderId, input.organizationId]
      );
      if (!orderResult.rows.length) {
        throw new Error("Order not found");
      }

      const paymentResult = await client.query<{
        id: string;
        order_id: string;
        amount: string;
        method: string;
        paid_at: string;
        reference: string | null;
        created_at: string;
      }>(
        `INSERT INTO payments (order_id, amount, method, paid_at, reference)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, order_id, amount, method, paid_at, reference, created_at`,
        [input.orderId, input.amount, input.method, input.paidAt ?? new Date().toISOString(), input.reference ?? null]
      );
      const createdPayment = paymentResult.rows[0];

      await client.query(
        `UPDATE orders
         SET status = CASE WHEN (
              SELECT COALESCE(SUM(amount), 0) FROM payments WHERE order_id = $1
            ) >= total_amount THEN 'paid' ELSE status END,
             updated_at = NOW()
         WHERE id = $1`,
        [input.orderId]
      );

      await this.auditRepository.createTx(client, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "CREATE_PAYMENT",
        entity: "payment",
        entityId: createdPayment.id,
        metadata: {
          orderId: createdPayment.order_id,
          amount: Number(createdPayment.amount),
          method: createdPayment.method,
          paidAt: createdPayment.paid_at,
          reference: createdPayment.reference
        }
      });

      await this.financialRepository.createAllocationForPaymentTx({
        client,
        organizationId: input.organizationId,
        paymentId: createdPayment.id,
        paymentAmount: Number(createdPayment.amount),
        userId: input.userId
      });

      await client.query("COMMIT");
      return createdPayment;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async update(input: {
    organizationId: string;
    userId: string;
    paymentId: string;
    orderId?: string;
    amount?: number;
    method?: "cash" | "card" | "transfer" | "mbway";
    paidAt?: string;
    reference?: string;
  }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingResult = await client.query<{
        id: string;
        order_id: string;
        amount: string;
        method: string;
        paid_at: string;
        reference: string | null;
      }>(
        `SELECT p.id, p.order_id, p.amount, p.method, p.paid_at, p.reference
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE o.organization_id = $1
           AND p.id = $2
         LIMIT 1`,
        [input.organizationId, input.paymentId]
      );

      if (!existingResult.rows.length) {
        throw new Error("Payment not found");
      }

      const existing = existingResult.rows[0];
      const targetOrderId = input.orderId ?? existing.order_id;

      const orderResult = await client.query<{ id: string; total_amount: string }>(
        `SELECT id, total_amount
         FROM orders
         WHERE id = $1 AND organization_id = $2
         LIMIT 1`,
        [targetOrderId, input.organizationId]
      );

      if (!orderResult.rows.length) {
        throw new Error("Order not found");
      }

      const nextAmount = Number.isFinite(Number(input.amount)) ? Number(input.amount) : Number(existing.amount);
      const nextMethod = input.method ?? (existing.method as "cash" | "card" | "transfer" | "mbway");
      const nextPaidAt = input.paidAt ?? existing.paid_at;
      const nextReference = input.reference !== undefined ? input.reference : existing.reference;

      const updatedResult = await client.query<{
        id: string;
        order_id: string;
        amount: string;
        method: string;
        paid_at: string;
        reference: string | null;
        created_at: string;
      }>(
        `UPDATE payments
         SET order_id = $1,
             amount = $2,
             method = $3,
             paid_at = $4,
             reference = $5
         WHERE id = $6
         RETURNING id, order_id, amount, method, paid_at, reference, created_at`,
        [targetOrderId, nextAmount, nextMethod, nextPaidAt, nextReference ?? null, input.paymentId]
      );

      const updatedPayment = updatedResult.rows[0];

      await this.financialRepository.replaceAllocationForPaymentTx({
        client,
        organizationId: input.organizationId,
        paymentId: updatedPayment.id,
        paymentAmount: Number(updatedPayment.amount),
        userId: input.userId
      });

      const affectedOrderIds = [...new Set([existing.order_id, targetOrderId])];
      for (const orderId of affectedOrderIds) {
        await this.refreshOrderStatusTx(client, orderId);
      }

      await this.auditRepository.createTx(client, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "UPDATE_PAYMENT",
        entity: "payment",
        entityId: updatedPayment.id,
        metadata: {
          oldOrderId: existing.order_id,
          orderId: updatedPayment.order_id,
          oldAmount: Number(existing.amount),
          amount: Number(updatedPayment.amount),
          oldMethod: existing.method,
          method: updatedPayment.method,
          oldPaidAt: existing.paid_at,
          paidAt: updatedPayment.paid_at,
          oldReference: existing.reference,
          reference: updatedPayment.reference
        }
      });

      await client.query("COMMIT");
      return updatedPayment;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(input: {
    organizationId: string;
    userId: string;
    paymentId: string;
  }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingResult = await client.query<{
        id: string;
        order_id: string;
        amount: string;
        method: string;
        paid_at: string;
        reference: string | null;
      }>(
        `SELECT p.id, p.order_id, p.amount, p.method, p.paid_at, p.reference
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE o.organization_id = $1
           AND p.id = $2
         LIMIT 1`,
        [input.organizationId, input.paymentId]
      );

      if (!existingResult.rows.length) {
        throw new Error("Payment not found");
      }

      const existing = existingResult.rows[0];

      const allocationResult = await client.query<{ id: string; reversed: boolean }>(
        `SELECT fa.id, fa.reversed
         FROM financial_allocations fa
         WHERE fa.organization_id = $1
           AND fa.payment_id = $2
         LIMIT 1`,
        [input.organizationId, input.paymentId]
      );

      if (allocationResult.rows.length) {
        const allocation = allocationResult.rows[0];
        if (!allocation.reversed) {
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
              reason: "payment_deleted"
            }
          });
        }
      }

      await client.query(`DELETE FROM payments WHERE id = $1`, [input.paymentId]);

      await this.refreshOrderStatusTx(client, existing.order_id);

      await this.auditRepository.createTx(client, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "DELETE_PAYMENT",
        entity: "payment",
        entityId: existing.id,
        metadata: {
          orderId: existing.order_id,
          amount: Number(existing.amount),
          method: existing.method,
          paidAt: existing.paid_at,
          reference: existing.reference
        }
      });

      await client.query("COMMIT");
      return {
        paymentId: input.paymentId,
        deleted: true
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
