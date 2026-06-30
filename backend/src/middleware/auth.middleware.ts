import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { HttpError } from "../utils/http-error";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing or invalid Authorization header");
  }

  const token = header.replace("Bearer ", "").trim();
  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(token);
  } catch (_error) {
    throw new HttpError(401, "Invalid or expired access token");
  }

  req.auth = {
    userId: payload.userId,
    organizationId: payload.organizationId,
    role: payload.role
  };

  next();
}
