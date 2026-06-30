import { PoolClient } from "pg";
import { pool } from "../../db/pool";
import { Pagination } from "../shared/pagination";

export interface VideoQuoteRecord {
  id: string;
  organizationId: string;
  clientId: string | null;
  clientName: string | null;
  serviceMode: string;
  tipologia: string | null;
  status: string;
  reviewRequired: boolean;
  quoteNumber: string;
  invoiceNumber: string | null;
  estimatedTotal: number;
  invoiceTotal: number | null;
  serviceContext: Record<string, unknown>;
  analysis: Record<string, unknown>;
  videoFileName: string;
  videoMimeType: string;
  videoPath: string;
  quoteDocPath: string | null;
  invoiceDocPath: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

function toNumber(value: string | number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toJsonObject<T extends Record<string, unknown>>(value: unknown): T {
  if (value && typeof value === "object") return value as T;
  return {} as T;
}

type QueryClient = Pick<PoolClient, "query">;

function queryDb(client?: QueryClient) {
  return client ?? pool;
}

function seriesKey(organizationId: string, kind: "quote" | "invoice", year: number) {
  return `${organizationId}:${kind}:${year}`;
}

export class VideoQuotesRepository {
  async getNextQuoteNumber(organizationId: string, year: number, client?: QueryClient): Promise<string> {
    const db = queryDb(client);
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [seriesKey(organizationId, "quote", year)]);
    const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)).toISOString();
    const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)).toISOString();
    const result = await db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM video_quotes
       WHERE organization_id = $1
         AND created_at >= $2
         AND created_at < $3`,
      [organizationId, start, end]
    );
    const next = (result.rows[0]?.total ?? 0) + 1;
    return `ORC-${year}-${String(next).padStart(4, "0")}`;
  }

  async getNextInvoiceNumber(organizationId: string, year: number, client?: QueryClient): Promise<string> {
    const db = queryDb(client);
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [seriesKey(organizationId, "invoice", year)]);
    const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)).toISOString();
    const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)).toISOString();
    const result = await db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM video_quotes
       WHERE organization_id = $1
         AND approved_at IS NOT NULL
         AND approved_at >= $2
         AND approved_at < $3`,
      [organizationId, start, end]
    );
    const next = (result.rows[0]?.total ?? 0) + 1;
    return `FAT-${year}-${String(next).padStart(4, "0")}`;
  }

  async create(input: {
    id: string;
    organizationId: string;
    clientId?: string | null;
    clientName?: string | null;
    serviceMode: string;
    tipologia?: string | null;
    status?: "draft" | "review_required" | "approved" | "invoiced";
    reviewRequired: boolean;
    quoteNumber: string;
    estimatedTotal: number;
    invoiceTotal?: number | null;
    serviceContext: Record<string, unknown>;
    analysis: Record<string, unknown>;
    videoFileName: string;
    videoMimeType: string;
    videoPath: string;
    quoteDocPath?: string | null;
    notes?: string | null;
    createdBy?: string | null;
  }, client?: QueryClient): Promise<VideoQuoteRecord> {
    const db = queryDb(client);
    const result = await db.query<VideoQuoteRecord & {
      organization_id: string;
      client_id: string | null;
      service_mode: string;
      tipologia: string | null;
      review_required: boolean;
      quote_number: string;
      invoice_number: string | null;
      estimated_total: string;
      invoice_total: string | null;
      service_context: unknown;
      analysis_json: unknown;
      video_file_name: string;
      video_mime_type: string;
      video_path: string;
      quote_doc_path: string | null;
      invoice_doc_path: string | null;
      notes: string | null;
      created_by: string | null;
      created_at: string;
      updated_at: string;
      approved_at: string | null;
    }>(
      `INSERT INTO video_quotes (
         id,
         organization_id,
         client_id,
         client_name,
         service_mode,
         tipologia,
         status,
         review_required,
         quote_number,
         estimated_total,
         invoice_total,
         service_context,
         analysis_json,
         video_file_name,
         video_mime_type,
         video_path,
         quote_doc_path,
         notes,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        input.id,
        input.organizationId,
        input.clientId ?? null,
        input.clientName ?? null,
        input.serviceMode,
        input.tipologia ?? null,
        input.status ?? "draft",
        input.reviewRequired,
        input.quoteNumber,
        input.estimatedTotal,
        input.invoiceTotal ?? null,
        JSON.stringify(input.serviceContext),
        JSON.stringify(input.analysis),
        input.videoFileName,
        input.videoMimeType,
        input.videoPath,
        input.quoteDocPath ?? null,
        input.notes ?? null,
        input.createdBy ?? null
      ]
    );

    return this.mapRecord(result.rows[0]);
  }

  async list(
    organizationId: string,
    pagination: Pagination,
    filter?: { clientId?: string; status?: string; pricingMode?: string }
  ): Promise<{ items: VideoQuoteRecord[]; total: number }> {
    const offset = (pagination.page - 1) * pagination.pageSize;
    const params: Array<string | number> = [organizationId];
    const where: string[] = ["vq.organization_id = $1"];

    if (filter?.clientId) {
      params.push(filter.clientId);
      where.push(`vq.client_id = $${params.length}`);
    }

    if (filter?.status) {
      params.push(filter.status);
      where.push(`vq.status = $${params.length}`);
    }

    if (filter?.pricingMode) {
      params.push(filter.pricingMode);
      where.push(`vq.service_mode = $${params.length}`);
    }

    const [itemsResult, totalResult] = await Promise.all([
      pool.query(
        `
        SELECT
          vq.*,
          c.name AS client_name
        FROM video_quotes vq
        LEFT JOIN clients c ON c.id = vq.client_id
        WHERE ${where.join(" AND ")}
        ORDER BY vq.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `,
        [...params, pagination.pageSize, offset]
      ),
      pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM video_quotes vq
        WHERE ${where.join(" AND ")}
        `,
        params
      )
    ]);

    return {
      items: itemsResult.rows.map((row) => this.mapRecord(row)),
      total: totalResult.rows[0].total as number
    };
  }

  async findById(organizationId: string, quoteId: string): Promise<VideoQuoteRecord | null> {
    const result = await pool.query(
      `
      SELECT
        vq.*,
        c.name AS client_name
      FROM video_quotes vq
      LEFT JOIN clients c ON c.id = vq.client_id
      WHERE vq.organization_id = $1 AND vq.id = $2
      LIMIT 1
      `,
      [organizationId, quoteId]
    );

    if (!result.rows.length) return null;
    return this.mapRecord(result.rows[0]);
  }

  async attachQuoteDocument(organizationId: string, quoteId: string, quoteDocPath: string, client?: QueryClient): Promise<VideoQuoteRecord> {
    const db = queryDb(client);
    const result = await db.query(`UPDATE video_quotes SET quote_doc_path = $1, updated_at = NOW() WHERE organization_id = $2 AND id = $3 RETURNING *`, [
      quoteDocPath,
      organizationId,
      quoteId
    ]);
    if (!result.rows.length) throw new Error("VIDEO_QUOTE_NOT_FOUND");
    return this.mapRecord(result.rows[0]);
  }

  async approveQuote(input: {
    organizationId: string;
    quoteId: string;
    invoiceNumber: string;
    invoiceDocPath: string;
    invoiceTotal: number;
  }, client?: QueryClient): Promise<VideoQuoteRecord> {
    const db = queryDb(client);
    const result = await db.query(
      `
      UPDATE video_quotes
      SET status = 'invoiced',
          invoice_number = $1,
          invoice_doc_path = $2,
          invoice_total = $3,
          approved_at = NOW(),
          updated_at = NOW()
      WHERE organization_id = $4
        AND id = $5
      RETURNING *
      `,
      [input.invoiceNumber, input.invoiceDocPath, input.invoiceTotal, input.organizationId, input.quoteId]
    );
    if (!result.rows.length) throw new Error("VIDEO_QUOTE_NOT_FOUND");
    return this.mapRecord(result.rows[0]);
  }

  async markReviewRequired(organizationId: string, quoteId: string): Promise<void> {
    await pool.query(
      `UPDATE video_quotes SET status = 'review_required', updated_at = NOW() WHERE organization_id = $1 AND id = $2`,
      [organizationId, quoteId]
    );
  }

  private mapRecord(row: any): VideoQuoteRecord {
    return {
      id: row.id,
      organizationId: row.organization_id,
      clientId: row.client_id ?? null,
      clientName: row.client_name ?? row.client_name ?? null,
      serviceMode: row.service_mode,
      tipologia: row.tipologia ?? null,
      status: row.status,
      reviewRequired: !!row.review_required,
      quoteNumber: row.quote_number,
      invoiceNumber: row.invoice_number ?? null,
      estimatedTotal: toNumber(row.estimated_total),
      invoiceTotal: row.invoice_total == null ? null : toNumber(row.invoice_total),
      serviceContext: toJsonObject<Record<string, unknown>>(row.service_context),
      analysis: toJsonObject<Record<string, unknown>>(row.analysis_json),
      videoFileName: row.video_file_name,
      videoMimeType: row.video_mime_type,
      videoPath: row.video_path,
      quoteDocPath: row.quote_doc_path ?? null,
      invoiceDocPath: row.invoice_doc_path ?? null,
      notes: row.notes ?? null,
      createdBy: row.created_by ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      approvedAt: row.approved_at ?? null
    };
  }
}
