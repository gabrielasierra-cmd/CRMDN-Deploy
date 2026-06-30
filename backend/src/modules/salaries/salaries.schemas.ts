import { z } from "zod";
import { paginationSchema } from "../shared/pagination";

export const listSalariesSchema = paginationSchema.extend({
  query: paginationSchema.shape.query.extend({
    employeeId: z.string().uuid().optional(),
    periodMonth: z.string().date().optional()
  })
});
