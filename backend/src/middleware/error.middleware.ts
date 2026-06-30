import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/http-error";

export function notFoundMiddleware(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not Found" });
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Log sempre no backend para diagnosticar rapidamente erros 500.
  // eslint-disable-next-line no-console
  console.error("[api:error]", err);

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      details: err.flatten()
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }

  res.status(500).json({
    error: "Internal server error",
    details:
      process.env.NODE_ENV === "development" && err instanceof Error
        ? { message: err.message }
        : undefined
  });
}
