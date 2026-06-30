ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Produtos de limpeza';

UPDATE materials
SET category = CASE
  WHEN category IS NOT NULL AND trim(category) <> '' THEN category
  WHEN lower(name) ~ '(luva|mascara|oculos|bota|farda|epi|protec)' THEN 'EPIs'
  WHEN lower(name) ~ '(saco|guardanapo|papel|toalha|descart|copo|prato|frasco|rolo)' THEN 'Materiais descartáveis'
  WHEN lower(name) ~ '(aspir|mopa|esfreg|vass|balde|carro|maquina|equip)' THEN 'Equipamentos'
  ELSE 'Produtos de limpeza'
END;

CREATE INDEX IF NOT EXISTS idx_materials_org_category
  ON materials (organization_id, category, name);
