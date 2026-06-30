import { Request, Response } from "express";
import { HttpError } from "../../utils/http-error";
import { MaterialsService } from "./materials.service";

export class MaterialsController {
  constructor(private readonly service: MaterialsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 50);
    const data = await this.service.list(req.auth.organizationId, page, pageSize, {
      status: req.query.status as "normal" | "attention" | "critical" | undefined,
      sort: req.query.sort as "stock_asc" | "stock_desc" | "critical_first" | undefined,
      category: req.query.category as string | undefined
    });

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

    const data = await this.service.create(req.auth.organizationId, req.auth.userId, req.body);
    res.status(201).json(data);
  };

  movement = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const data = await this.service.createMovement(req.auth.organizationId, req.auth.userId, req.body);
    res.status(201).json(data);
  };

  history = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 50);
    const data = await this.service.history(req.auth.organizationId, page, pageSize, req.query.materialId as string | undefined);

    res.json({
      ...data,
      page,
      pageSize
    });
  };
}
