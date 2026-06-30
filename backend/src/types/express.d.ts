import { AuthContext } from "../modules/users/user.types";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
