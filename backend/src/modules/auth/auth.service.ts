import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { HttpError } from "../../utils/http-error";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt";
import { comparePassword, hashPassword } from "../../utils/password";
import { AuthRepository } from "./auth.repository";

interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  organizationName: string;
}

interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async register(input: RegisterInput) {
    const existing = await this.repository.findByEmail(input.email);
    if (existing) {
      throw new HttpError(409, "Email already in use");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.repository.createUserWithOrganization({
      fullName: input.fullName,
      email: input.email,
      passwordHash,
      organizationName: input.organizationName
    });

    return this.issueTokens(user.userId, user.organizationId, user.role, {
      userId: user.userId,
      fullName: user.fullName,
      email: user.email
    });
  }

  async login(input: LoginInput) {
    const user = await this.repository.findByEmail(input.email);
    if (!user) {
      throw new HttpError(401, "Invalid credentials");
    }

    const validPassword = await comparePassword(input.password, user.passwordHash);
    if (!validPassword) {
      throw new HttpError(401, "Invalid credentials");
    }

    return this.issueTokens(user.userId, user.organizationId, user.role, {
      userId: user.userId,
      fullName: user.fullName,
      email: user.email
    });
  }

  async refresh(oldRefreshToken: string) {
    let payload: ReturnType<typeof verifyRefreshToken>;
    try {
      payload = verifyRefreshToken(oldRefreshToken);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new HttpError(401, "Refresh token expired");
      }
      throw new HttpError(401, "Invalid refresh token");
    }

    const valid = await this.repository.isRefreshTokenValid(payload.userId, oldRefreshToken);
    if (!valid) {
      throw new HttpError(401, "Refresh token revoked or invalid");
    }

    await this.repository.revokeRefreshToken(payload.userId, oldRefreshToken);

    return this.issueTokens(payload.userId, payload.organizationId, payload.role);
  }

  async logout(userId: string, refreshToken: string) {
    await this.repository.revokeRefreshToken(userId, refreshToken);
  }

  private async issueTokens(
    userId: string,
    organizationId: string,
    role: "admin" | "staff",
    user?: { userId: string; fullName: string; email: string }
  ) {
    const tokenPayload = { userId, organizationId, role };
    const accessToken = signAccessToken(tokenPayload);
    const refreshTokenBundle = signRefreshToken(tokenPayload);

    const decoded = jwt.decode(refreshTokenBundle.token) as { exp?: number } | null;
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.repository.storeRefreshToken(userId, refreshTokenBundle.token, expiresAt);

    return {
      accessToken,
      refreshToken: refreshTokenBundle.token,
      user,
      organizationId,
      role,
      accessTokenExpiresIn: env.JWT_ACCESS_EXPIRES_IN
    };
  }
}
