CREATE OR REPLACE VIEW work_hours AS
SELECT
  id,
  organization_id,
  id_trabalhador,
  data,
  horas_trabalhadas,
  local_trabalho,
  created_at,
  updated_at
FROM registo_horas;

CREATE OR REPLACE VIEW financial_expenses AS
SELECT
  id,
  organization_id,
  category,
  description,
  amount,
  expense_date,
  created_by,
  created_at
FROM expenses;
