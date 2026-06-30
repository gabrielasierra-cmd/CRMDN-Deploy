CREATE TABLE IF NOT EXISTS video_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name VARCHAR(160),
  service_mode VARCHAR(40) NOT NULL,
  tipologia VARCHAR(40),
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  review_required BOOLEAN NOT NULL DEFAULT FALSE,
  quote_number VARCHAR(40) NOT NULL,
  invoice_number VARCHAR(40),
  estimated_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  invoice_total NUMERIC(12,2),
  service_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  analysis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  video_file_name VARCHAR(255) NOT NULL,
  video_mime_type VARCHAR(120) NOT NULL,
  video_path TEXT NOT NULL,
  quote_doc_path TEXT,
  invoice_doc_path TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  CONSTRAINT video_quotes_status_check CHECK (status IN ('draft', 'review_required', 'approved', 'invoiced'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_quotes_org_quote_number
  ON video_quotes (organization_id, quote_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_quotes_org_invoice_number
  ON video_quotes (organization_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_quotes_org_created_at
  ON video_quotes (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_quotes_org_status
  ON video_quotes (organization_id, status);
