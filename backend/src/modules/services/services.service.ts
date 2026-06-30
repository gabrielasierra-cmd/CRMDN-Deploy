import { ServicesRepository } from "./services.repository";

export class ServicesService {
  constructor(private readonly repository: ServicesRepository) {}

  list(organizationId: string, page: number, pageSize: number) {
    return this.repository.list(organizationId, { page, pageSize });
  }

  create(
    organizationId: string,
    payload: { name: string; description?: string; durationMinutes: number; price: number }
  ) {
    return this.repository.create({ organizationId, ...payload });
  }
}
