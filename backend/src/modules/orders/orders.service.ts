import { HttpError } from "../../utils/http-error";
import { OrdersRepository } from "./orders.repository";

export class OrdersService {
  constructor(private readonly repository: OrdersRepository) {}

  list(organizationId: string, page: number, pageSize: number) {
    return this.repository.list(organizationId, { page, pageSize });
  }

  async create(
    organizationId: string,
    payload: { clientId: string; serviceId: string; employeeId?: string; scheduledAt: string; notes?: string }
  ) {
    try {
      return await this.repository.create({ organizationId, ...payload });
    } catch (error) {
      if (error instanceof Error && error.message === "Service not found") {
        throw new HttpError(404, "Service not found");
      }
      throw error;
    }
  }
}
