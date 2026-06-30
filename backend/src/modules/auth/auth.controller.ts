import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { HttpError } from "../../utils/http-error";
import { setCsrfCookie } from "../../middleware/csrf.middleware";

function setRefreshCookie(res: Response, token: string): void {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
}

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.register(req.body);
    setRefreshCookie(res, result.refreshToken);
    const csrfToken = setCsrfCookie(res);

    res.status(201).json({
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      organizationId: result.organizationId,
      role: result.role,
      user: result.user,
      csrfToken
    });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.login(req.body);
    setRefreshCookie(res, result.refreshToken);
    const csrfToken = setCsrfCookie(res);

    res.json({
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      organizationId: result.organizationId,
      role: result.role,
      user: result.user,
      csrfToken
    });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new HttpError(401, "Missing refresh token cookie");
    }

    const result = await this.service.refresh(refreshToken);
    setRefreshCookie(res, result.refreshToken);
    const csrfToken = setCsrfCookie(res);

    res.json({
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      organizationId: result.organizationId,
      role: result.role,
      csrfToken
    });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken || !req.auth) {
      throw new HttpError(401, "Not authenticated");
    }

    await this.service.logout(req.auth.userId, refreshToken);
    res.clearCookie("refresh_token");
    res.clearCookie("csrf_token");

    res.status(204).send();
  };
}
