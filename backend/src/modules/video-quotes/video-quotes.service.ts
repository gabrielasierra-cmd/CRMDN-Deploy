import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { pool } from "../../db/pool";
import { env } from "../../config/env";
import { VideoQuotesRepository, VideoQuoteRecord } from "./video-quotes.repository";
import { analisarVideo } from "./video-quotes.analyzer";
import {
  calcularValores,
  PricingMode,
  TipologiaMode,
  DetectedDivision,
  PricingResult
} from "./video-quotes.pricing";
import { generateInvoiceDocument, generateQuoteDocument } from "./video-quotes.documents";

interface ClientRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface AnalyzeBudgetInput {
  organizationId: string;
  userId: string;
  clientId: string;
  pricingMode: PricingMode;
  tipologia?: TipologiaMode;
  hours?: number;
  workers?: number;
  areaM2?: number;
  floors?: number;
  notes?: string;
  fileName: string;
  mimeType: string;
  videoBuffer: Buffer;
}

function roundMoney(value: number): number {
  return Number(Number(value || 0).toFixed(2));
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("webm")) return ".webm";
  if (normalized.includes("quicktime") || normalized.includes("mov")) return ".mov";
  if (normalized.includes("avi")) return ".avi";
  return ".mp4";
}

function baseName(fileName: string): string {
  return String(fileName || "video").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) || "video";
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function saveBuffer(filePath: string, buffer: Buffer): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, buffer);
}

function enrichAnalysis(divisoes: DetectedDivision[], pricing: PricingResult) {
  return {
    divisoes: pricing.divisoes.map((division) => ({
      tipo: division.tipo,
      nivel_sujidade: division.nivel_sujidade,
      tamanho: division.tamanho,
      itens_detectados: division.itens_detectados,
      observacoes: division.observacoes ?? "",
      valor_base: division.valor_base,
      extras_detectados: division.extras_detectados,
      valor_estimado: division.valor_estimado
    })),
    total_estimado: pricing.total_estimado,
    reviewRequired: pricing.reviewRequired,
    observations: pricing.notes,
    detectedCount: divisoes.length,
    summary: pricing.summary
  };
}

export class VideoQuotesService {
  constructor(private readonly repository: VideoQuotesRepository) {}

  async list(organizationId: string, page: number, pageSize: number, filter?: { clientId?: string; status?: string; pricingMode?: string }) {
    return this.repository.list(organizationId, { page, pageSize }, filter);
  }

  async get(organizationId: string, quoteId: string) {
    const quote = await this.repository.findById(organizationId, quoteId);
    if (!quote) {
      throw new Error("VIDEO_QUOTE_NOT_FOUND");
    }
    return quote;
  }

  private async getClient(organizationId: string, clientId: string): Promise<ClientRow> {
    const result = await pool.query<ClientRow>(
      `SELECT id, name, email, phone
       FROM clients
       WHERE organization_id = $1
         AND id = $2
       LIMIT 1`,
      [organizationId, clientId]
    );

    const client = result.rows[0];
    if (!client) {
      throw new Error("CLIENT_NOT_FOUND");
    }
    return client;
  }

  private async buildQuoteFiles(input: {
    quoteDir: string;
    quoteNumber: string;
    createdAt: Date;
    client: ClientRow;
    pricingMode: PricingMode;
    tipologia?: TipologiaMode;
    analysis: ReturnType<typeof enrichAnalysis>;
    notes: string[];
    estimatedTotal: number;
  }): Promise<{ quoteDocPath: string }> {
    const quoteDocPath = path.join(input.quoteDir, "orcamento.docx");
    const buffer = await generateQuoteDocument({
      quoteNumber: input.quoteNumber,
      createdAt: input.createdAt,
      clientName: input.client.name,
      clientEmail: input.client.email,
      clientPhone: input.client.phone,
      serviceMode: input.tipologia ? `${input.pricingMode} | ${input.tipologia}` : input.pricingMode,
      divisionRows: input.analysis.divisoes,
      estimatedTotal: input.estimatedTotal,
      notes: input.notes.length ? input.notes : ["Analise concluida automaticamente."]
    });
    await saveBuffer(quoteDocPath, buffer);
    return { quoteDocPath };
  }

  async analyzeAndCreateQuote(input: AnalyzeBudgetInput): Promise<VideoQuoteRecord> {
    if (!input.clientId) {
      throw new Error("CLIENT_ID_REQUIRED");
    }

    const client = await this.getClient(input.organizationId, input.clientId);
    const quoteId = randomUUID();
    const createdAt = new Date();
    const rootDir = path.resolve(process.cwd(), "storage", "video-quotes", input.organizationId, quoteId);
    await ensureDir(rootDir);

    const videoFileName = `${baseName(input.fileName)}${extensionFromMimeType(input.mimeType)}`;
    const videoPath = path.join(rootDir, videoFileName);
    await saveBuffer(videoPath, input.videoBuffer);

    const analysis = await analisarVideo(
      {
        videoPath,
        pricingMode: input.pricingMode,
        tipologia: input.tipologia,
        clientName: client.name,
        notes: input.notes
      },
      {
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
        sampleCount: env.OPENAI_VIDEO_FRAME_COUNT
      }
    );

    const pricing = calcularValores(analysis.divisoes, {
      pricingMode: input.pricingMode,
      tipologia: input.tipologia,
      hours: input.hours,
      workers: input.workers,
      areaM2: input.areaM2,
      floors: input.floors
    });

    const quoteData = enrichAnalysis(analysis.divisoes, pricing);
    const reviewRequired = pricing.reviewRequired || analysis.reviewRequired;
    if (reviewRequired) {
      quoteData.reviewRequired = true;
    }

    const quoteDocPath = path.join(rootDir, "orcamento.docx");
    const db = await pool.connect();
    let committed = false;
    try {
      await db.query("BEGIN");
      const quoteNumber = await this.repository.getNextQuoteNumber(input.organizationId, createdAt.getUTCFullYear(), db);
      const created = await this.repository.create({
        id: quoteId,
        organizationId: input.organizationId,
        clientId: client.id,
        clientName: client.name,
        serviceMode: input.pricingMode,
        tipologia: input.tipologia ?? null,
        status: reviewRequired ? "review_required" : "draft",
        reviewRequired,
        quoteNumber,
        estimatedTotal: pricing.total_estimado,
        serviceContext: {
          clientId: client.id,
          pricingMode: input.pricingMode,
          tipologia: input.tipologia ?? null,
          hours: input.hours ?? null,
          workers: input.workers ?? null,
          areaM2: input.areaM2 ?? null,
          floors: input.floors ?? null,
          notes: input.notes ?? ""
        },
        analysis: quoteData,
        videoFileName,
        videoMimeType: input.mimeType,
        videoPath,
        quoteDocPath,
        notes: input.notes ?? null,
        createdBy: input.userId
      }, db);

      await this.buildQuoteFiles({
        quoteDir: rootDir,
        quoteNumber: created.quoteNumber,
        createdAt,
        client,
        pricingMode: input.pricingMode,
        tipologia: input.tipologia,
        analysis: quoteData,
        notes: [
          ...(analysis.observations || []),
          reviewRequired ? "Requer aprovacao manual antes da faturacao." : "Pronto para aprovacao."
        ],
        estimatedTotal: pricing.total_estimado
      });

      await db.query("COMMIT");
      committed = true;
      return created;
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      await fs.rm(quoteDocPath, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      db.release();
      if (!committed) {
        await fs.rm(rootDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  async approveQuote(organizationId: string, quoteId: string): Promise<VideoQuoteRecord> {
    const quote = await this.get(organizationId, quoteId);
    if (quote.status === "invoiced" && quote.invoiceDocPath && quote.invoiceNumber) {
      return quote;
    }

    const approvedAt = new Date();
    const invoiceTotal = roundMoney(quote.estimatedTotal * 1.23);
    const vatAmount = roundMoney(invoiceTotal - quote.estimatedTotal);
    const invoiceDocPath = path.join(path.dirname(quote.videoPath), "fatura.docx");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const invoiceNumber = await this.repository.getNextInvoiceNumber(organizationId, approvedAt.getUTCFullYear(), db);
      const buffer = await generateInvoiceDocument({
        invoiceNumber,
        quoteNumber: quote.quoteNumber,
        createdAt: approvedAt,
        clientName: quote.clientName || "Cliente",
        serviceMode: quote.serviceMode,
        estimatedTotal: quote.estimatedTotal,
        vatRate: 23,
        vatAmount,
        totalToPay: invoiceTotal
      });

      await saveBuffer(invoiceDocPath, buffer);
      const updated = await this.repository.approveQuote({
        organizationId,
        quoteId,
        invoiceNumber,
        invoiceDocPath,
        invoiceTotal
      }, db);
      await db.query("COMMIT");
      return updated;
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      await fs.rm(invoiceDocPath, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      db.release();
    }
  }

  async getDocumentFile(organizationId: string, quoteId: string, kind: "quote" | "invoice") {
    const quote = await this.get(organizationId, quoteId);
    const filePath = kind === "quote" ? quote.quoteDocPath : quote.invoiceDocPath;
    if (!filePath) {
      throw new Error(kind === "quote" ? "QUOTE_DOCUMENT_NOT_READY" : "INVOICE_DOCUMENT_NOT_READY");
    }

    const fileName = kind === "quote" ? `${quote.quoteNumber}.docx` : `${quote.invoiceNumber || "fatura"}.docx`;
    return {
      filePath,
      fileName,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    };
  }
}
