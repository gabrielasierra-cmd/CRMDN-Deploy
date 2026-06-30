import { Request, Response } from "express";
import { ClientsService } from "./clients.service";
import { HttpError } from "../../utils/http-error";

export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);

    const data = await this.service.list(req.auth.organizationId, page, pageSize);
    res.json({
      ...data,
      page,
      pageSize
    });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const client = await this.service.create(req.auth.organizationId, req.body);
    res.status(201).json(client);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const client = await this.service.update(req.auth.organizationId, req.params.clientId, req.body);
    res.json(client);
  };
}
