import { Request, Response } from "express";
import { HttpError } from "../../utils/http-error";
import { SalariesService } from "./salaries.service";

export class SalariesController {
  constructor(private readonly service: SalariesService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const data = await this.service.list(req.auth.organizationId, page, pageSize, {
      employeeId: req.query.employeeId as string | undefined,
      periodMonth: req.query.periodMonth as string | undefined
    });

    res.json({
      ...data,
      page,
      pageSize
    });
  };
}
