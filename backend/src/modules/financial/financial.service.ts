import { FinancialRepository } from "./financial.repository";

export class FinancialService {
  constructor(private readonly repository: FinancialRepository) {}

  createFinancialAllocation(input: {
    organizationId: string;
    paymentId: string;
    amount: number;
    userId?: string;
  }) {
    return this.repository.createAllocationForPayment({
      organizationId: input.organizationId,
      paymentId: input.paymentId,
      paymentAmount: input.amount,
      userId: input.userId
    });
  }

  getSummary(organizationId: string) {
    return this.repository.getSummary(organizationId);
  }

  getDashboard(
    organizationId: string,
    filter?: {
      period?: "all" | "month" | "last3months" | "custom";
      startDate?: string;
      endDate?: string;
    }
  ) {
    return this.repository.getDashboard(organizationId, filter);
  }

  getHistory(organizationId: string, page: number, pageSize: number) {
    return this.repository.getHistory(organizationId, { page, pageSize });
  }

  getExpenses(organizationId: string, page: number, pageSize: number) {
    return this.repository.getExpenses(organizationId, { page, pageSize });
  }

  createExpense(
    organizationId: string,
    userId: string,
    payload: {
      expenseDate: string;
      product: string;
      supplier?: string;
      invoiceNo?: string;
      price: number;
      quantity: number;
      presentation?: string;
      responsible?: string;
      notes?: string;
    }
  ) {
    return this.repository.createExpense({ organizationId, userId, ...payload });
  }

  deleteExpense(organizationId: string, userId: string, expenseId: string) {
    return this.repository.deleteExpense({ organizationId, userId, expenseId });
  }

  updateSettings(
    organizationId: string,
    userId: string,
    payload: {
      sociosPercentage: number;
      investimentosPercentage: number;
      emergenciasPercentage: number;
      basePercentage: number;
    }
  ) {
    return this.repository.updateSettings({ organizationId, userId, ...payload });
  }

  recalculate(organizationId: string, userId: string, reason?: string) {
    return this.repository.recalculateAllocations({ organizationId, userId, reason });
  }

  reverseAllocation(organizationId: string, userId: string, paymentId: string, reason?: string) {
    return this.repository.reverseAllocation({ organizationId, userId, paymentId, reason });
  }
}
