-- Financial hardening migration:
-- 1) track immutable reversals without deleting data
-- 2) preserve settings and allocation integrity constraints

ALTER TABLE financial_allocations
  ADD COLUMN IF NOT EXISTS reversed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_fin_alloc_org_reversed_created
  ON financial_allocations (organization_id, reversed, created_at DESC);

-- Safety re-assertion (idempotent) for percentages sum.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'allocation_settings_percentage_sum_check'
  ) THEN
    ALTER TABLE allocation_settings
      ADD CONSTRAINT allocation_settings_percentage_sum_check
      CHECK (
        ROUND(socios_percentage + investimentos_percentage + emergencias_percentage + base_percentage, 2) = 100
      );
  END IF;
END $$;
