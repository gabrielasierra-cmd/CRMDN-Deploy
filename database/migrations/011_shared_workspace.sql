BEGIN;

DO $$
DECLARE
  shared_org_id UUID;
  chosen_allocation_setting_id UUID;
BEGIN
  SELECT id
  INTO shared_org_id
  FROM organizations
  WHERE name = 'Shared Workspace'
  ORDER BY created_at ASC
  LIMIT 1;

  IF shared_org_id IS NULL THEN
    INSERT INTO organizations (name)
    VALUES ('Shared Workspace')
    RETURNING id INTO shared_org_id;
  END IF;

  WITH ranked_user_orgs AS (
    SELECT ctid,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC, organization_id ASC) AS rn
    FROM user_organizations
  )
  DELETE FROM user_organizations
  WHERE ctid IN (
    SELECT ctid
    FROM ranked_user_orgs
    WHERE rn > 1
  );

  UPDATE user_organizations
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  UPDATE clients
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  UPDATE services
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  UPDATE employees
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  UPDATE orders
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  UPDATE expenses
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  UPDATE salaries
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  UPDATE materials
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  UPDATE material_movements
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  UPDATE audit_logs
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  UPDATE financial_allocations
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  UPDATE registo_horas
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  UPDATE video_quotes
  SET organization_id = shared_org_id
  WHERE organization_id <> shared_org_id;

  SELECT id
  INTO chosen_allocation_setting_id
  FROM allocation_settings
  ORDER BY updated_at DESC, id ASC
  LIMIT 1;

  IF chosen_allocation_setting_id IS NOT NULL THEN
    DELETE FROM allocation_settings
    WHERE id <> chosen_allocation_setting_id;

    UPDATE allocation_settings
    SET organization_id = shared_org_id
    WHERE id = chosen_allocation_setting_id;
  ELSE
    INSERT INTO allocation_settings (organization_id)
    VALUES (shared_org_id);
  END IF;
END $$;

COMMIT;
