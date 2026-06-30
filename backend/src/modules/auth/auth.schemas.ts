import { z } from "zod";

const strongPassword = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,64}$/;

export const registerSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    password: z
      .string()
      .regex(strongPassword, "Password must include upper, lower and number")
      .max(64),
    organizationName: z.string().trim().min(2).max(120)
  })
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1)
  })
});

export const refreshSchema = z.object({
  body: z.object({})
});
