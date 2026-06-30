INSERT INTO employees (organization_id, full_name)
SELECT o.id, v.full_name
FROM organizations o
CROSS JOIN (
  VALUES
    ('Paola D.'),
    ('Patricia S.'),
    ('Rita')
) AS v(full_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM employees e
  WHERE e.organization_id = o.id
    AND lower(e.full_name) = lower(v.full_name)
);
