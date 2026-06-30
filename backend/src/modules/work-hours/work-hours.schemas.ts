import { z } from "zod";

const workHourQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(500).default(100),
    employeeId: z.string().uuid().optional(),
    local: z.string().trim().min(1).max(120).optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional()
  })
  .superRefine((value, ctx) => {
    if (!value.startDate || !value.endDate) return;
    if (value.startDate > value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startDate must be before or equal to endDate"
      });
    }
  });

export const listWorkHoursSchema = z.object({
  query: workHourQuerySchema
});

export const workHoursStatsSchema = z.object({
  query: workHourQuerySchema
});

export const createWorkHourSchema = z.object({
  body: z.object({
    idTrabalhador: z.string().uuid(),
    data: z.string().date(),
    horasTrabalhadas: z.coerce.number().positive(),
    localTrabalho: z.string().trim().min(2).max(120)
  })
});

export const updateWorkHourSchema = z.object({
  params: z.object({
    recordId: z.string().uuid()
  }),
  body: z
    .object({
      idTrabalhador: z.string().uuid().optional(),
      data: z.string().date().optional(),
      horasTrabalhadas: z.coerce.number().positive().optional(),
      localTrabalho: z.string().trim().min(2).max(120).optional()
    })
    .superRefine((value, ctx) => {
      if (
        value.idTrabalhador === undefined &&
        value.data === undefined &&
        value.horasTrabalhadas === undefined &&
        value.localTrabalho === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one field must be provided"
        });
      }
    })
});

export const deleteWorkHourSchema = z.object({
  params: z.object({
    recordId: z.string().uuid()
  })
});
