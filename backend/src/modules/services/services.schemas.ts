import { z } from "zod";
import { paginationSchema } from "../shared/pagination";

export const listServicesSchema = paginationSchema;

export const createServiceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    durationMinutes: z.coerce.number().int().positive(),
    price: z.coerce.number().positive()
  })
});
