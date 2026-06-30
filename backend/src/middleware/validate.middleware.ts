import { NextFunction, Request, Response } from "express";
import { AnyZodObject } from "zod";

export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.parse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    req.body = parsed.body;
    req.params = parsed.params;
    req.query = parsed.query;

    next();
  };
}
