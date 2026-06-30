-- Financial module migration
-- Adds per-organization allocation settings and immutable allocation snapshots per payment.

CREATE TABLE IF NOT EXISTS allocation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  socios_percentage NUMERIC(5,2) NOT NULL DEFAULT 20,
  investimentos_percentage NUMERIC(5,2) NOT NULL DEFAULT 40,
  emergencias_percentage NUMERIC(5,2) NOT NULL DEFAULT 30,
  base_percentage NUMERIC(5,2) NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    ROUND(socios_percentage + investimentos_percentage + emergencias_percentage + base_percentage, 2) = 100
  )
);

CREATE TABLE IF NOT EXISTS financial_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  socios_amount NUMERIC(12,2) NOT NULL CHECK (socios_amount >= 0),
  investimentos_amount NUMERIC(12,2) NOT NULL CHECK (investimentos_amount >= 0),
  emergencias_amount NUMERIC(12,2) NOT NULL CHECK (emergencias_amount >= 0),
  base_amount NUMERIC(12,2) NOT NULL CHECK (base_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ROUND(socios_amount + investimentos_amount + emergencias_amount + base_amount, 2) = total_amount)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(80) NOT NULL,
  entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO allocation_settings (organization_id)
SELECT o.id
FROM organizations o
ON CONFLICT (organization_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_fin_alloc_org_created ON financial_allocations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_alloc_payment ON financial_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_entity_created ON audit_logs (organization_id, entity, created_at DESC);
