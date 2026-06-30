import { Request, Response } from "express";
import { HttpError } from "../../utils/http-error";
import { PaymentsService } from "./payments.service";

export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const data = await this.service.list(req.auth.organizationId, page, pageSize);
    res.json({ ...data, page, pageSize });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }
    const data = await this.service.create(req.auth.organizationId, req.auth.userId, req.body);
    res.status(201).json(data);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }
    const data = await this.service.update(req.auth.organizationId, req.auth.userId, req.params.paymentId, req.body);
    res.json(data);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }
    const data = await this.service.delete(req.auth.organizationId, req.auth.userId, req.params.paymentId);
    res.json(data);
  };
}
