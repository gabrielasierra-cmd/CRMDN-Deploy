import { z } from "zod";
import { paginationSchema } from "../shared/pagination";

export const listClientsSchema = paginationSchema;

export const createClientSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    company_name: z.string().trim().max(190).optional(),
    nif: z.string().trim().max(20).optional(),
    address: z.string().trim().max(500).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().max(25).optional(),
    notes: z.string().trim().max(1000).optional()
  })
});

export const updateClientSchema = z.object({
  params: z.object({
    clientId: z.string().uuid()
  }),
  body: z.object({
    name: z.string().trim().min(2).max(120),
    company_name: z.string().trim().max(190).nullable().optional(),
    nif: z.string().trim().max(20).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    email: z.string().trim().toLowerCase().email().nullable().optional(),
    phone: z.string().trim().max(25).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional()
  })
});
