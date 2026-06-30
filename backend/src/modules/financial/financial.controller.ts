import { Request, Response } from "express";
import { HttpError } from "../../utils/http-error";
import { FinancialService } from "./financial.service";

export class FinancialController {
  constructor(private readonly service: FinancialService) {}

  summary = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const data = await this.service.getSummary(req.auth.organizationId);
    res.json(data);
  };

  dashboard = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const data = await this.service.getDashboard(req.auth.organizationId, {
      period: req.query.period as "all" | "month" | "last3months" | "custom" | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined
    });
    res.json(data);
  };

  history = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const data = await this.service.getHistory(req.auth.organizationId, page, pageSize);

    res.json({
      ...data,
      page,
      pageSize
    });
  };

  expenses = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 200);
    const data = await this.service.getExpenses(req.auth.organizationId, page, pageSize);

    res.json({
      ...data,
      page,
      pageSize
    });
  };

  createExpense = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const data = await this.service.createExpense(req.auth.organizationId, req.auth.userId, req.body);
    res.status(201).json(data);
  };

  deleteExpense = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    try {
      const data = await this.service.deleteExpense(req.auth.organizationId, req.auth.userId, req.params.expenseId);
      res.json(data);
    } catch (error) {
      if (error instanceof Error && error.message === "EXPENSE_NOT_FOUND") {
        throw new HttpError(404, "Expense not found");
      }
      throw error;
    }
  };

  updateSettings = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    try {
      const data = await this.service.updateSettings(req.auth.organizationId, req.auth.userId, req.body);
      res.json(data);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_PERCENTAGES") {
        throw new HttpError(400, "Percentages must sum to 100");
      }
      throw error;
    }
  };

  recalculate = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const data = await this.service.recalculate(req.auth.organizationId, req.auth.userId, req.body.reason);
    res.json(data);
  };

  reverse = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    try {
      const data = await this.service.reverseAllocation(
        req.auth.organizationId,
        req.auth.userId,
        req.params.paymentId,
        req.body?.reason
      );
      res.json(data);
    } catch (error) {
      if (error instanceof Error && error.message === "ALLOCATION_NOT_FOUND") {
        throw new HttpError(404, "Financial allocation not found for this payment");
      }
      throw error;
    }
  };
}
