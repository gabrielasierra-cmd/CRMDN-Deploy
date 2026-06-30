import { HttpError } from "../../utils/http-error";
import { ClientsRepository } from "./clients.repository";

export class ClientsService {
  constructor(private readonly repository: ClientsRepository) {}

  list(organizationId: string, page: number, pageSize: number) {
    return this.repository.list(organizationId, { page, pageSize });
  }

  create(
    organizationId: string,
    payload: {
      name: string;
      company_name?: string;
      nif?: string;
      address?: string;
      email?: string;
      phone?: string;
      notes?: string;
    }
  ) {
    return this.repository.create({ organizationId, ...payload });
  }

  async update(
    organizationId: string,
    clientId: string,
    payload: {
      name: string;
      company_name?: string | null;
      nif?: string | null;
      address?: string | null;
      email?: string | null;
      phone?: string | null;
      notes?: string | null;
    }
  ) {
    const updated = await this.repository.update({ organizationId, clientId, ...payload });
    if (!updated) {
      throw new HttpError(404, "Client not found");
    }
    return updated;
  }
}
