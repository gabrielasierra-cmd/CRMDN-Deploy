import { HttpError } from "../../utils/http-error";
import { PaymentsRepository } from "./payments.repository";
import { FinancialService } from "../financial/financial.service";
import { FinancialRepository } from "../financial/financial.repository";

export class PaymentsService {
  constructor(
    private readonly repository: PaymentsRepository,
    private readonly financialService = new FinancialService(new FinancialRepository())
  ) {}

  list(organizationId: string, page: number, pageSize: number) {
    return this.repository.list(organizationId, { page, pageSize });
  }

  async create(
    organizationId: string,
    userId: string,
    payload: {
      orderId: string;
      amount: number;
      method: "cash" | "card" | "transfer" | "mbway";
      paidAt?: string;
      reference?: string;
    }
  ) {
    try {
      const payment = await this.repository.create({ organizationId, userId, ...payload });

      // Mandatory finance integration: guarantee allocation attempt right after payment creation.
      await this.financialService.createFinancialAllocation({
        organizationId,
        paymentId: payment.id,
        amount: Number(payment.amount),
        userId
      });

      return payment;
    } catch (error) {
      if (error instanceof Error && error.message === "Order not found") {
        throw new HttpError(404, "Order not found");
      }
      if (error instanceof Error && error.message === "INVALID_PERCENTAGES") {
        throw new HttpError(400, "Allocation percentages must sum to 100");
      }
      throw error;
    }
  }

  async update(
    organizationId: string,
    userId: string,
    paymentId: string,
    payload: {
      orderId?: string;
      amount?: number;
      method?: "cash" | "card" | "transfer" | "mbway";
      paidAt?: string;
      reference?: string;
    }
  ) {
    try {
      return await this.repository.update({ organizationId, userId, paymentId, ...payload });
    } catch (error) {
      if (error instanceof Error && error.message === "Payment not found") {
        throw new HttpError(404, "Payment not found");
      }
      if (error instanceof Error && error.message === "Order not found") {
        throw new HttpError(404, "Order not found");
      }
      if (error instanceof Error && error.message === "INVALID_PERCENTAGES") {
        throw new HttpError(400, "Allocation percentages must sum to 100");
      }
      throw error;
    }
  }

  async delete(organizationId: string, userId: string, paymentId: string) {
    try {
      return await this.repository.delete({ organizationId, userId, paymentId });
    } catch (error) {
      if (error instanceof Error && error.message === "Payment not found") {
        throw new HttpError(404, "Payment not found");
      }
      throw error;
    }
  }
}
