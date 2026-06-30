import { HttpError } from "../../utils/http-error";
import { MaterialsRepository } from "./materials.repository";
import { MaterialMovementType, MaterialStatus } from "./materials.schemas";

export class MaterialsService {
  constructor(private readonly repository: MaterialsRepository) {}

  list(
    organizationId: string,
    page: number,
    pageSize: number,
    filter?: { status?: MaterialStatus; sort?: string; category?: string }
  ) {
    return this.repository.list(organizationId, { page, pageSize }, filter);
  }

  async create(
    organizationId: string,
    userId: string,
    payload: {
      name: string;
      category?: string;
      sku?: string | null;
      unit?: string;
      currentStock: number;
      minStock: number;
      consumoMensal: number;
      unitCost?: number;
    }
  ) {
    try {
      return await this.repository.create({ organizationId, userId, ...payload });
    } catch (error) {
      if (error instanceof Error && error.message === "MATERIAL_ALREADY_EXISTS") {
        throw new HttpError(409, "Material already exists");
      }
      throw error;
    }
  }

  async createMovement(
    organizationId: string,
    userId: string,
    payload: {
      materialId: string;
      type: MaterialMovementType;
      quantity: number;
      note?: string | null;
    }
  ) {
    if (payload.type !== "ADJUST" && payload.quantity <= 0) {
      throw new HttpError(400, "Quantity must be greater than zero");
    }

    try {
      return await this.repository.createMovement({ organizationId, userId, ...payload });
    } catch (error) {
      if (error instanceof Error && error.message === "MATERIAL_NOT_FOUND") {
        throw new HttpError(404, "Material not found");
      }
      if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
        throw new HttpError(400, "Insufficient stock");
      }
      throw error;
    }
  }

  history(organizationId: string, page: number, pageSize: number, materialId?: string) {
    return this.repository.history(organizationId, { page, pageSize }, materialId);
  }
}
