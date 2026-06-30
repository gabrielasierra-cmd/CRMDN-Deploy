CREATE TABLE IF NOT EXISTS registo_horas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  id_trabalhador UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  horas_trabalhadas NUMERIC(6,2) NOT NULL CHECK (horas_trabalhadas > 0),
  local_trabalho VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registo_horas_org_data
  ON registo_horas (organization_id, data DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registo_horas_org_trabalhador
  ON registo_horas (organization_id, id_trabalhador, data DESC);

CREATE INDEX IF NOT EXISTS idx_registo_horas_org_local
  ON registo_horas (organization_id, lower(local_trabalho));
