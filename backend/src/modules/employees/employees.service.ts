import { HttpError } from "../../utils/http-error";
import { EmployeesRepository } from "./employees.repository";

export class EmployeesService {
  constructor(private readonly repository: EmployeesRepository) {}

  list(organizationId: string, page: number, pageSize: number) {
    return this.repository.list(organizationId, { page, pageSize });
  }

  create(
    organizationId: string,
    payload: { fullName: string; email?: string; phone?: string; salaryBase?: number; hireDate?: string }
  ) {
    return this.repository.create({ organizationId, ...payload });
  }

  async createVacation(
    organizationId: string,
    employeeId: string,
    payload: { startDate: string; endDate: string; reason?: string }
  ) {
    if (payload.endDate < payload.startDate) {
      throw new HttpError(400, "endDate must be >= startDate");
    }
    const vacation = await this.repository.createVacation({ organizationId, employeeId, ...payload });
    if (!vacation) {
      throw new HttpError(404, "Employee not found");
    }
    return vacation;
  }
}
