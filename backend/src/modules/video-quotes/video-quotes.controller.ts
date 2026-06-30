import { Request, Response } from "express";
import fs from "fs";
import { HttpError } from "../../utils/http-error";
import { VideoQuotesService } from "./video-quotes.service";
import { analyzeBudgetVideoQuerySchema, approveVideoQuoteSchema, listVideoQuotesSchema, videoQuoteDocumentParamsSchema, videoQuoteParamsSchema } from "./video-quotes.schemas";

export class VideoQuotesController {
  constructor(private readonly service: VideoQuotesService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const parsed = listVideoQuotesSchema.parse({ query: req.query });
    const data = await this.service.list(
      req.auth.organizationId,
      Number(parsed.query.page),
      Number(parsed.query.pageSize),
      {
        clientId: parsed.query.clientId,
        status: parsed.query.status,
        pricingMode: parsed.query.pricingMode
      }
    );

    res.json({
      ...data,
      page: Number(parsed.query.page),
      pageSize: Number(parsed.query.pageSize)
    });
  };

  get = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const { params } = videoQuoteParamsSchema.parse({ params: req.params });
    try {
      const data = await this.service.get(req.auth.organizationId, params.quoteId);
      res.json(data);
    } catch (error) {
      if (error instanceof Error && error.message === "VIDEO_QUOTE_NOT_FOUND") {
        throw new HttpError(404, "Video quote not found");
      }
      throw error;
    }
  };

  analyze = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    if (!Buffer.isBuffer(req.body)) {
      throw new HttpError(400, "Video file is required");
    }

    const parsed = analyzeBudgetVideoQuerySchema.parse({ query: req.query });

    try {
      const data = await this.service.analyzeAndCreateQuote({
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        clientId: parsed.query.clientId,
        pricingMode: parsed.query.pricingMode,
        tipologia: parsed.query.tipologia,
        hours: parsed.query.hours,
        workers: parsed.query.workers,
        areaM2: parsed.query.areaM2,
        floors: parsed.query.floors,
        notes: parsed.query.notes,
        fileName: String(req.headers["x-file-name"] || "video.mp4"),
        mimeType: String(req.headers["content-type"] || "application/octet-stream"),
        videoBuffer: req.body
      });

      res.status(201).json(data);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "CLIENT_NOT_FOUND") {
          throw new HttpError(404, "Client not found");
        }
        if (error.message === "OPENAI_API_KEY_REQUIRED") {
          throw new HttpError(503, "OPENAI_API_KEY is required for automatic video analysis");
        }
        if (error.message === "POST_OBRA_CONTEXT_REQUIRED") {
          throw new HttpError(400, "Hours and workers are required for post-obra pricing");
        }
        if (error.message === "AI_JSON_NOT_FOUND" || error.message === "AI_JSON_INVALID") {
          throw new HttpError(502, "AI response could not be parsed");
        }
      }
      throw error;
    }
  };

  approve = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const parsed = approveVideoQuoteSchema.parse({ params: req.params, body: req.body });

    try {
      const data = await this.service.approveQuote(req.auth.organizationId, parsed.params.quoteId);
      res.json(data);
    } catch (error) {
      if (error instanceof Error && error.message === "VIDEO_QUOTE_NOT_FOUND") {
        throw new HttpError(404, "Video quote not found");
      }
      throw error;
    }
  };

  downloadDocument = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      throw new HttpError(401, "Unauthorized");
    }

    const parsed = videoQuoteDocumentParamsSchema.parse({ params: req.params });
    try {
      const file = await this.service.getDocumentFile(req.auth.organizationId, parsed.params.quoteId, parsed.params.kind);
      if (!fs.existsSync(file.filePath)) {
        throw new HttpError(404, "Document not found");
      }
      res.download(file.filePath, file.fileName);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "VIDEO_QUOTE_NOT_FOUND") {
          throw new HttpError(404, "Video quote not found");
        }
        if (error.message === "QUOTE_DOCUMENT_NOT_READY") {
          throw new HttpError(404, "Quote document not ready");
        }
        if (error.message === "INVOICE_DOCUMENT_NOT_READY") {
          throw new HttpError(404, "Invoice document not ready");
        }
      }
      throw error;
    }
  };
}
