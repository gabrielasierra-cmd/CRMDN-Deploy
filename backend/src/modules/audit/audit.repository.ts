import { PoolClient } from "pg";

interface CreateAuditLogInput {
  organizationId: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export class AuditRepository {
  async createTx(client: PoolClient, input: CreateAuditLogInput): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs (organization_id, user_id, action, entity, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.organizationId,
        input.userId ?? null,
        input.action,
        input.entity,
        input.entityId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );
  }
}
