import { z } from "zod";
import { paginationSchema } from "../shared/pagination";

export const listEmployeesSchema = paginationSchema;

export const createEmployeeSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().max(25).optional(),
    salaryBase: z.coerce.number().nonnegative().optional(),
    hireDate: z.string().date().optional()
  })
});

export const createVacationSchema = z.object({
  params: z.object({
    employeeId: z.string().uuid()
  }),
  body: z.object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    reason: z.string().trim().max(200).optional()
  })
});
