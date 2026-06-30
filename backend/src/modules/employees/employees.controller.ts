import { Request, Response } from "express";
import { HttpError } from "../../utils/http-error";
import { EmployeesService } from "./employees.service";

export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

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
    const data = await this.service.create(req.auth.organizationId, req.body);
    res.status(201).json(data);
  };

  createVacation = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }
    const data = await this.service.createVacation(req.auth.organizationId, req.params.employeeId, req.body);
    res.status(201).json(data);
  };
}
