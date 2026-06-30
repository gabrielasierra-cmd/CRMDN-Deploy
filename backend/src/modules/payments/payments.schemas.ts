import { z } from "zod";
import { paginationSchema } from "../shared/pagination";

export const listPaymentsSchema = paginationSchema;

export const createPaymentSchema = z.object({
  body: z.object({
    orderId: z.string().uuid(),
    amount: z.coerce.number().positive(),
    method: z.enum(["cash", "card", "transfer", "mbway"]),
    paidAt: z.string().datetime().optional(),
    reference: z.string().trim().max(120).optional()
  })
});

export const updatePaymentSchema = z.object({
  params: z.object({
    paymentId: z.string().uuid()
  }),
  body: z
    .object({
      orderId: z.string().uuid().optional(),
      amount: z.coerce.number().positive().optional(),
      method: z.enum(["cash", "card", "transfer", "mbway"]).optional(),
      paidAt: z.string().datetime().optional(),
      reference: z.string().trim().max(120).optional()
    })
    .superRefine((value, ctx) => {
      if (
        value.orderId === undefined &&
        value.amount === undefined &&
        value.method === undefined &&
        value.paidAt === undefined &&
        value.reference === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one payment field must be provided"
        });
      }
    })
});

export const deletePaymentSchema = z.object({
  params: z.object({
    paymentId: z.string().uuid()
  })
});
