import { z } from "zod";
import { paginationSchema } from "../shared/pagination";

const percentageField = z.coerce.number().min(0).max(100);

export const financialSummarySchema = z.object({
  query: z.object({})
});

const dashboardPeriodSchema = z.enum(["all", "month", "last3months", "custom"]).default("all");

export const financialDashboardSchema = z.object({
  query: z
    .object({
      period: dashboardPeriodSchema.optional(),
      startDate: z.string().date().optional(),
      endDate: z.string().date().optional()
    })
    .superRefine((value, ctx) => {
      const period = value.period ?? "all";
      if (period !== "custom") return;

      if (!value.startDate || !value.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "startDate and endDate are required when period is custom"
        });
        return;
      }

      if (value.startDate > value.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "startDate must be before or equal to endDate"
        });
      }
    })
});

export const financialHistorySchema = paginationSchema;
export const financialExpensesSchema = paginationSchema;

export const createFinancialExpenseSchema = z.object({
  body: z.object({
    expenseDate: z.string().date(),
    product: z.string().trim().min(1).max(80),
    supplier: z.string().trim().max(80).optional().default(""),
    invoiceNo: z.string().trim().max(80).optional().default(""),
    price: z.coerce.number().positive(),
    quantity: z.coerce.number().int().min(1).default(1),
    presentation: z.string().trim().max(40).optional().default(""),
    responsible: z.string().trim().max(80).optional().default(""),
    notes: z.string().trim().max(300).optional().default("")
  })
});

export const deleteFinancialExpenseSchema = z.object({
  params: z.object({
    expenseId: z.string().uuid()
  })
});

export const updateAllocationSettingsSchema = z.object({
  body: z
    .object({
      sociosPercentage: percentageField,
      investimentosPercentage: percentageField,
      emergenciasPercentage: percentageField,
      basePercentage: percentageField
    })
    .superRefine((value, ctx) => {
      const total = value.sociosPercentage + value.investimentosPercentage + value.emergenciasPercentage + value.basePercentage;
      if (Math.abs(total - 100) > 0.001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Percentages must sum to 100"
        });
      }
    })
});

export const recalculateFinancialSchema = z.object({
  body: z.object({
    reason: z.string().trim().max(300).optional()
  })
});

export const reverseAllocationSchema = z.object({
  params: z.object({
    paymentId: z.string().uuid()
  }),
  body: z
    .object({
      reason: z.string().trim().max(300).optional()
    })
    .optional()
});
