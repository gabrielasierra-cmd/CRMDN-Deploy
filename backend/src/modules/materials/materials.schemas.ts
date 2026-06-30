import { z } from "zod";
import { paginationSchema } from "../shared/pagination";

const materialStatusSchema = z.enum(["normal", "attention", "critical"]);
const materialMovementTypeSchema = z.enum(["IN", "OUT", "ADJUST"]);

export const listMaterialsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(500).default(50),
    status: materialStatusSchema.optional(),
    sort: z.enum(["stock_asc", "stock_desc", "critical_first"]).optional(),
    category: z.string().trim().max(80).optional()
  })
});

export const createMaterialSchema = z.object({
  body: z.object({
    name: z.string().trim().min(3).max(120),
    category: z.string().trim().min(2).max(80).optional().default("Produtos de limpeza"),
    sku: z.string().trim().max(80).optional().nullable(),
    unit: z.string().trim().max(20).optional().default("unit"),
    currentStock: z.coerce.number().min(0),
    minStock: z.coerce.number().min(0),
    consumoMensal: z.coerce.number().min(0),
    unitCost: z.coerce.number().min(0).optional().default(0)
  })
});

export const createStockMovementSchema = z.object({
  body: z.object({
    materialId: z.string().uuid(),
    type: materialMovementTypeSchema,
    quantity: z.coerce.number().min(0),
    note: z.string().trim().max(300).optional().nullable()
  })
});

export const stockHistorySchema = paginationSchema.extend({
  query: paginationSchema.shape.query.extend({
    materialId: z.string().uuid().optional()
  })
});

export type MaterialStatus = z.infer<typeof materialStatusSchema>;
export type MaterialMovementType = z.infer<typeof materialMovementTypeSchema>;
