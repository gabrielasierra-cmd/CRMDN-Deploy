ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS consumo_mensal NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (consumo_mensal >= 0);

DO $$
BEGIN
  CREATE TYPE stock_movement_type AS ENUM ('IN', 'OUT', 'ADJUST');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  type stock_movement_type NOT NULL,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity >= 0),
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_org_created ON stock_movements (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_material_created ON stock_movements (material_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_org_stock ON materials (organization_id, current_stock ASC);

INSERT INTO stock_movements (
  organization_id, material_id, type, quantity, note, created_by, created_at
)
SELECT
  mm.organization_id,
  mm.material_id,
  CASE
    WHEN mm.movement_type::text = 'adjustment' THEN 'ADJUST'
    WHEN mm.movement_type::text = 'in' THEN 'IN'
    ELSE 'OUT'
  END::stock_movement_type,
  mm.quantity,
  mm.notes,
  mm.created_by,
  mm.created_at
FROM material_movements mm
WHERE NOT EXISTS (
  SELECT 1
  FROM stock_movements sm
  WHERE sm.organization_id = mm.organization_id
    AND sm.material_id = mm.material_id
    AND sm.quantity = mm.quantity
    AND COALESCE(sm.note, '') = COALESCE(mm.notes, '')
    AND sm.created_at = mm.created_at
);
