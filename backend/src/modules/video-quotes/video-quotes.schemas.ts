import { z } from "zod";
import { paginationSchema } from "../shared/pagination";

export const pricingModeSchema = z.enum(["divisoes", "tipologia", "pos_obra", "restaurante", "escritorio"]);
export const tipologiaModeSchema = z.enum(["t0_t1_t2_normal", "t0_t1_t2_profunda", "t3", "t4"]);

export const analyzeBudgetVideoQuerySchema = z.object({
  query: z.object({
    clientId: z.string().uuid(),
    pricingMode: pricingModeSchema.default("divisoes"),
    tipologia: tipologiaModeSchema.optional(),
    hours: z.coerce.number().positive().optional(),
    workers: z.coerce.number().int().positive().optional(),
    areaM2: z.coerce.number().positive().optional(),
    floors: z.coerce.number().int().positive().optional(),
    notes: z.string().trim().max(1000).optional().default("")
  })
});

export const listVideoQuotesSchema = paginationSchema.extend({
  query: paginationSchema.shape.query.extend({
    clientId: z.string().uuid().optional(),
    status: z.enum(["draft", "review_required", "approved", "invoiced"]).optional(),
    pricingMode: pricingModeSchema.optional()
  })
});

export const videoQuoteParamsSchema = z.object({
  params: z.object({
    quoteId: z.string().uuid()
  })
});

export const videoQuoteDocumentParamsSchema = z.object({
  params: z.object({
    quoteId: z.string().uuid(),
    kind: z.enum(["quote", "invoice"])
  })
});

export const approveVideoQuoteSchema = z.object({
  params: z.object({
    quoteId: z.string().uuid()
  }),
  body: z
    .object({
      notes: z.string().trim().max(1000).optional()
    })
    .optional()
});
