import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";
import { AuthContext } from "../modules/users/user.types";

type AccessPayload = AuthContext & { type: "access" };
type RefreshPayload = AuthContext & { type: "refresh"; tokenId: string };

export function signAccessToken(payload: AuthContext): string {
  const fullPayload: AccessPayload = { ...payload, type: "access" };
  return jwt.sign(fullPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  });
}

export function signRefreshToken(payload: AuthContext): { token: string; tokenId: string } {
  const tokenId = crypto.randomUUID();
  const fullPayload: RefreshPayload = { ...payload, type: "refresh", tokenId };
  const token = jwt.sign(fullPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  });
  return { token, tokenId };
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
}
