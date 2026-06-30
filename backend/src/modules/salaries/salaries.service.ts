import { SalariesRepository } from "./salaries.repository";

export class SalariesService {
  constructor(private readonly repository: SalariesRepository) {}

  list(
    organizationId: string,
    page: number,
    pageSize: number,
    filter?: { employeeId?: string; periodMonth?: string }
  ) {
    return this.repository.list(organizationId, { page, pageSize }, filter);
  }
}
