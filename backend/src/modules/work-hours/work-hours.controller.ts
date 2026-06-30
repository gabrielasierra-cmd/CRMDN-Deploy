import { Request, Response } from "express";
import { HttpError } from "../../utils/http-error";
import { WorkHoursService } from "./work-hours.service";

export class WorkHoursController {
  constructor(private readonly service: WorkHoursService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 100);
    const data = await this.service.list(req.auth.organizationId, page, pageSize, {
      employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
      local: req.query.local ? String(req.query.local) : undefined,
      startDate: req.query.startDate ? String(req.query.startDate) : undefined,
      endDate: req.query.endDate ? String(req.query.endDate) : undefined
    });

    res.json({ ...data, page, pageSize });
  };

  stats = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const data = await this.service.stats(req.auth.organizationId, {
      employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
      local: req.query.local ? String(req.query.local) : undefined,
      startDate: req.query.startDate ? String(req.query.startDate) : undefined,
      endDate: req.query.endDate ? String(req.query.endDate) : undefined
    });

    res.json(data);
  };

  create = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const data = await this.service.create(req.auth.organizationId, req.body);
    res.status(201).json(data);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const data = await this.service.update(req.auth.organizationId, req.params.recordId, req.body);
    res.json(data);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const data = await this.service.delete(req.auth.organizationId, req.params.recordId);
    res.json(data);
  };
}
