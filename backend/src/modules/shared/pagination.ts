import { z } from "zod";

export const paginationSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(500).default(20)
  })
});

export interface Pagination {
  page: number;
  pageSize: number;
}
