import { NextFunction, Request, Response } from "express";
import { RoleName } from "../modules/users/user.types";
import { HttpError } from "../utils/http-error";

export function authorize(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    if (!roles.includes(req.auth.role)) {
      throw new HttpError(403, "Forbidden");
    }

    next();
  };
}
