import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http-error";

export function setCsrfCookie(res: Response): string {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie("csrf_token", token, {
    httpOnly: false,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  });
  return token;
}

export function verifyCsrf(req: Request, _res: Response, next: NextFunction): void {
  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.headers["x-csrf-token"];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new HttpError(403, "Invalid CSRF token");
  }

  next();
}
