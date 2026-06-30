import { HttpError } from "../../utils/http-error";
import { WorkHoursRepository } from "./work-hours.repository";

export class WorkHoursService {
  constructor(private readonly repository: WorkHoursRepository) {}

  list(
    organizationId: string,
    page: number,
    pageSize: number,
    filters: { employeeId?: string; local?: string; startDate?: string; endDate?: string }
  ) {
    return this.repository.list(organizationId, { page, pageSize, ...filters });
  }

  stats(organizationId: string, filters: { employeeId?: string; local?: string; startDate?: string; endDate?: string }) {
    return this.repository.stats(organizationId, filters);
  }

  async create(
    organizationId: string,
    payload: { idTrabalhador: string; data: string; horasTrabalhadas: number; localTrabalho: string }
  ) {
    const record = await this.repository.create({
      organizationId,
      employeeId: payload.idTrabalhador,
      data: payload.data,
      horasTrabalhadas: payload.horasTrabalhadas,
      localTrabalho: payload.localTrabalho
    });

    if (!record) {
      throw new HttpError(404, "Employee not found");
    }

    return record;
  }

  async update(
    organizationId: string,
    recordId: string,
    payload: { idTrabalhador?: string; data?: string; horasTrabalhadas?: number; localTrabalho?: string }
  ) {
    const record = await this.repository.update({
      organizationId,
      recordId,
      employeeId: payload.idTrabalhador,
      data: payload.data,
      horasTrabalhadas: payload.horasTrabalhadas,
      localTrabalho: payload.localTrabalho
    });

    if (!record) {
      throw new HttpError(404, "Work hour not found");
    }

    return record;
  }

  async delete(organizationId: string, recordId: string) {
    const record = await this.repository.delete({ organizationId, recordId });
    if (!record) {
      throw new HttpError(404, "Work hour not found");
    }
    return { id: recordId, deleted: true };
  }
}
