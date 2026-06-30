import { z } from "zod";
import { paginationSchema } from "../shared/pagination";

export const listOrdersSchema = paginationSchema;

export const createOrderSchema = z.object({
  body: z.object({
    clientId: z.string().uuid(),
    serviceId: z.string().uuid(),
    employeeId: z.string().uuid().optional(),
    scheduledAt: z.string().datetime(),
    notes: z.string().trim().max(1000).optional()
  })
});
