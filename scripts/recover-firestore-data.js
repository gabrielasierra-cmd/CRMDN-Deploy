const fs = require("fs");
const path = require("path");
const https = require("https");
const { Client } = require("../backend/node_modules/pg");

const PROJECT_ID = "dn-crm-f8112";
const API_KEY = "AIzaSyBG5V9lNcR8Qg36Q5z66Z2lSNMDErLvcTo";
const COLLECTION = "crm_data";

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function fieldToValue(field) {
  if (!field || typeof field !== "object") return null;
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("booleanValue" in field) return !!field.booleanValue;
  if ("nullValue" in field) return null;
  if ("timestampValue" in field) return field.timestampValue;
  if ("mapValue" in field) {
    const out = {};
    const fields = field.mapValue.fields || {};
    Object.keys(fields).forEach((key) => {
      out[key] = fieldToValue(fields[key]);
    });
    return out;
  }
  if ("arrayValue" in field) {
    const values = field.arrayValue.values || [];
    return values.map(fieldToValue);
  }
  return null;
}

function str(value, max = 500) {
  const text = String(value || "").trim();
  return text.length > max ? text.slice(0, max) : text;
}

function parsePositiveNumber(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Number(n.toFixed(2));
}

function parseDateISO(value, fallback = "2026-01-01") {
  const raw = str(value, 40);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T12:00:00.000Z`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return new Date(raw).toISOString();
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  return `${fallback}T12:00:00.000Z`;
}

function parseMonthToDate(value) {
  const raw = str(value, 10);
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  return "2026-01-01";
}

function mapOrderStatus(status) {
  const v = str(status, 30).toLowerCase();
  if (["scheduled", "agendado", "agendada", "pendente", "pending"].includes(v)) return "scheduled";
  if (["in_progress", "em_execucao", "em execução", "em curso"].includes(v)) return "in_progress";
  if (["done", "concluido", "concluida", "completed"].includes(v)) return "done";
  if (["paid", "pago", "paga"].includes(v)) return "paid";
  if (["cancelled", "cancelado", "cancelada"].includes(v)) return "cancelled";
  return "scheduled";
}

function mapPaymentMethod(method) {
  const v = str(method, 40).toLowerCase();
  if (v.includes("mbway")) return "mbway";
  if (v.includes("trfb") || v.includes("transfer")) return "transfer";
  if (v.includes("card") || v.includes("cart") || v.includes("tpv")) return "card";
  if (v.includes("cash") || v.includes("efectivo") || v.includes("efetivo") || v.includes("dinheiro")) return "cash";
  return "transfer";
}

function distributeAmount(totalAmount, settings) {
  const safeTotal = Math.max(0, Number(Number(totalAmount).toFixed(2)));
  const totalCents = Math.round(safeTotal * 100);
  const ratios = [
    { key: "sociosAmount", percentage: settings.sociosPercentage },
    { key: "investimentosAmount", percentage: settings.investimentosPercentage },
    { key: "emergenciasAmount", percentage: settings.emergenciasPercentage },
    { key: "baseAmount", percentage: settings.basePercentage }
  ];

  const calculated = ratios.map((item) => {
    const rawCents = (totalCents * item.percentage) / 100;
    const floorCents = Math.floor(rawCents);
    return { key: item.key, floorCents, fraction: rawCents - floorCents };
  });

  const distributed = {};
  calculated.forEach((item) => {
    distributed[item.key] = item.floorCents;
  });

  let remaining = totalCents - calculated.reduce((acc, item) => acc + item.floorCents, 0);
  if (remaining > 0) {
    const byFraction = [...calculated].sort((a, b) => b.fraction - a.fraction);
    for (let i = 0; i < byFraction.length && remaining > 0; i += 1) {
      distributed[byFraction[i].key] += 1;
      remaining -= 1;
    }
  }

  return {
    totalAmount: safeTotal,
    sociosAmount: distributed.sociosAmount / 100,
    investimentosAmount: distributed.investimentosAmount / 100,
    emergenciasAmount: distributed.emergenciasAmount / 100,
    baseAmount: distributed.baseAmount / 100
  };
}

async function getAllFirestoreDocuments() {
  const listUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?key=${API_KEY}`;
  const list = await fetchJson(listUrl);
  const docs = {};

  for (const doc of list.documents || []) {
    const id = doc.name.split("/").pop();
    docs[id] = fieldToValue(doc.fields?.value) || [];
  }

  return docs;
}

async function main() {
  const docs = await getAllFirestoreDocuments();

  const backupsDir = path.join(__dirname, "..", "database", "backups");
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = nowStamp();

  const fullBackupPath = path.join(backupsDir, `firestore-crm_data-${stamp}.json`);
  fs.writeFileSync(fullBackupPath, JSON.stringify({ exportedAt: new Date().toISOString(), docs }, null, 2), "utf-8");

  const pg = new Client({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: "postgres",
    database: "crm"
  });
  await pg.connect();

  const stats = {
    clients: { source: 0, inserted: 0, skipped: 0 },
    employees: { source: 0, inserted: 0, skipped: 0 },
    materials: { source: 0, inserted: 0, skipped: 0 },
    expenses: { source: 0, inserted: 0, skipped: 0 },
    services: { source: 0, inserted: 0, skipped: 0 },
    orders: { source: 0, inserted: 0, skipped: 0 },
    payments: { source: 0, inserted: 0, skipped: 0 },
    salaries: { source: 0, inserted: 0, skipped: 0 },
    materialMovements: { source: 0, inserted: 0, skipped: 0 }
  };

  const unmapped = {
    teams: docs.teams || [],
    crm_users: docs.crm_users || [],
    invoices: docs.invoices || [],
    extraShifts: docs.extraShifts || []
  };
  const unmappedPath = path.join(backupsDir, `firestore-unmapped-${stamp}.json`);
  fs.writeFileSync(unmappedPath, JSON.stringify({ exportedAt: new Date().toISOString(), unmapped }, null, 2), "utf-8");

  try {
    await pg.query("BEGIN");

    const orgPick = await pg.query(
      `SELECT o.id as org_id, u.id as user_id, o.name
       FROM users u
       JOIN user_organizations uo ON uo.user_id = u.id
       JOIN organizations o ON o.id = uo.organization_id
       ORDER BY CASE WHEN lower(u.email) = 'gabriela.rosero23@gmail.com' THEN 0 ELSE 1 END, o.created_at ASC
       LIMIT 1`
    );
    if (!orgPick.rows.length) throw new Error("No organization/user found in database.");
    const organizationId = orgPick.rows[0].org_id;
    const userId = orgPick.rows[0].user_id;

    await pg.query(
      `INSERT INTO allocation_settings (organization_id)
       VALUES ($1::uuid)
       ON CONFLICT (organization_id) DO NOTHING`,
      [organizationId]
    );

    const clientIdByLegacyId = new Map();
    const clientIdByName = new Map();
    const employeeIdByName = new Map();
    const serviceIdByName = new Map();
    const materialIdByName = new Map();

    async function getOrCreateClientByName(name, phone = null, notes = null) {
      const key = str(name, 120).toLowerCase();
      if (!key) return null;
      if (clientIdByName.has(key)) return clientIdByName.get(key);

      const existing = await pg.query(
        `SELECT id FROM clients WHERE organization_id = $1::uuid AND lower(name) = $2 LIMIT 1`,
        [organizationId, key]
      );
      if (existing.rows.length) {
        clientIdByName.set(key, existing.rows[0].id);
        return existing.rows[0].id;
      }

      const created = await pg.query(
        `INSERT INTO clients (organization_id, name, phone, notes)
         VALUES ($1::uuid, $2::varchar(120), $3::varchar(25), $4::text)
         RETURNING id`,
        [organizationId, str(name, 120), phone ? str(phone, 25) : null, notes ? str(notes, 1000) : null]
      );
      const id = created.rows[0].id;
      clientIdByName.set(key, id);
      return id;
    }

    async function getOrCreateEmployeeByName(name) {
      const key = str(name, 120).toLowerCase();
      if (!key) return null;
      if (employeeIdByName.has(key)) return employeeIdByName.get(key);

      const existing = await pg.query(
        `SELECT id FROM employees WHERE organization_id = $1::uuid AND lower(full_name) = $2 LIMIT 1`,
        [organizationId, key]
      );
      if (existing.rows.length) {
        employeeIdByName.set(key, existing.rows[0].id);
        return existing.rows[0].id;
      }

      const created = await pg.query(
        `INSERT INTO employees (organization_id, full_name)
         VALUES ($1::uuid, $2::varchar(120))
         RETURNING id`,
        [organizationId, str(name, 120)]
      );
      const id = created.rows[0].id;
      employeeIdByName.set(key, id);
      return id;
    }

    async function getOrCreateService(input) {
      const name = str(input.name, 120);
      const key = name.toLowerCase();
      if (!key) return null;
      if (serviceIdByName.has(key)) return serviceIdByName.get(key);

      const existing = await pg.query(
        `SELECT id FROM services WHERE organization_id = $1::uuid AND lower(name) = $2 LIMIT 1`,
        [organizationId, key]
      );
      if (existing.rows.length) {
        serviceIdByName.set(key, existing.rows[0].id);
        return existing.rows[0].id;
      }

      const created = await pg.query(
        `INSERT INTO services (organization_id, name, description, duration_minutes, price)
         VALUES ($1::uuid, $2::varchar(120), $3::text, $4::int, $5::numeric(12,2))
         RETURNING id`,
        [
          organizationId,
          name,
          str(input.description || "", 1000) || null,
          Math.max(15, Number(input.durationMinutes || 60)),
          parsePositiveNumber(input.price, 1)
        ]
      );
      const id = created.rows[0].id;
      serviceIdByName.set(key, id);
      return id;
    }

    async function getOrCreateMaterialByName(name, currentStock = 0, minStock = 0) {
      const key = str(name, 120).toLowerCase();
      if (!key) return null;
      if (materialIdByName.has(key)) return materialIdByName.get(key);

      const existing = await pg.query(
        `SELECT id FROM materials WHERE organization_id = $1::uuid AND lower(name) = $2 LIMIT 1`,
        [organizationId, key]
      );
      if (existing.rows.length) {
        materialIdByName.set(key, existing.rows[0].id);
        return existing.rows[0].id;
      }

      const created = await pg.query(
        `INSERT INTO materials (organization_id, name, current_stock, min_stock, unit_cost)
         VALUES ($1::uuid, $2::varchar(120), $3::numeric(14,3), $4::numeric(14,3), 0)
         RETURNING id`,
        [organizationId, str(name, 120), Math.max(0, Number(currentStock || 0)), Math.max(0, Number(minStock || 0))]
      );
      const id = created.rows[0].id;
      materialIdByName.set(key, id);
      return id;
    }

    const legacyClients = docs.clients || [];
    stats.clients.source = legacyClients.length;
    for (const row of legacyClients) {
      const name = str(row.name, 120);
      if (!name) {
        stats.clients.skipped += 1;
        continue;
      }

      const notesParts = [];
      if (row.address) notesParts.push(`Morada: ${str(row.address, 200)}`);
      if (row.serviceType) notesParts.push(`Tipo:${str(row.serviceType, 80)}`);
      if (row.frequency) notesParts.push(`Frequencia:${str(row.frequency, 80)}`);
      if (row.notes) notesParts.push(str(row.notes, 600));
      const notes = notesParts.join(" | ");

      const before = await pg.query(
        `SELECT id FROM clients WHERE organization_id = $1::uuid AND lower(name) = $2 LIMIT 1`,
        [organizationId, name.toLowerCase()]
      );
      const clientId = await getOrCreateClientByName(name, row.contact && row.contact !== "-" ? row.contact : null, notes || null);
      if (str(row.id, 60)) clientIdByLegacyId.set(str(row.id, 60), clientId);
      if (before.rows.length) stats.clients.skipped += 1;
      else stats.clients.inserted += 1;
    }

    const legacyEmployees = docs.employees || [];
    stats.employees.source = legacyEmployees.length;
    for (const row of legacyEmployees) {
      const fullName = str(row.name, 120);
      if (!fullName) {
        stats.employees.skipped += 1;
        continue;
      }
      const before = await pg.query(
        `SELECT id FROM employees WHERE organization_id = $1::uuid AND lower(full_name) = $2 LIMIT 1`,
        [organizationId, fullName.toLowerCase()]
      );
      await getOrCreateEmployeeByName(fullName);
      if (before.rows.length) stats.employees.skipped += 1;
      else stats.employees.inserted += 1;
    }

    const legacyMaterials = docs.materials || [];
    stats.materials.source = legacyMaterials.length;
    for (const row of legacyMaterials) {
      const name = str(row.name, 120);
      if (!name) {
        stats.materials.skipped += 1;
        continue;
      }
      const before = await pg.query(
        `SELECT id FROM materials WHERE organization_id = $1::uuid AND lower(name) = $2 LIMIT 1`,
        [organizationId, name.toLowerCase()]
      );
      await getOrCreateMaterialByName(name, row.stock, row.minStock);
      if (before.rows.length) stats.materials.skipped += 1;
      else stats.materials.inserted += 1;
    }

    const legacyExpenses = docs.expenses || [];
    stats.expenses.source = legacyExpenses.length;
    for (const row of legacyExpenses) {
      const product = str(row.product || "Outros", 80);
      const provider = str(row.provider, 80);
      const presentation = str(row.presentation, 40);
      const invoiceNo = str(row.invoiceNo, 80);
      const responsible = str(row.responsible, 80);
      const notes = str(row.notes, 300);
      const price = parsePositiveNumber(row.price, 0);
      const quantity = Math.max(1, Number(row.quantity || 1));
      const amount = Number((price * quantity).toFixed(2));
      const expenseDate = /^\d{4}-\d{2}-\d{2}$/.test(str(row.date, 10)) ? str(row.date, 10) : "2026-01-01";
      if (amount <= 0) {
        stats.expenses.skipped += 1;
        continue;
      }

      const descriptionParts = [];
      if (provider) descriptionParts.push(`Fornecedor: ${provider}`);
      if (presentation) descriptionParts.push(`Pagamento: ${presentation}`);
      if (invoiceNo) descriptionParts.push(`Fatura: ${invoiceNo}`);
      if (responsible) descriptionParts.push(`Responsavel: ${responsible}`);
      if (notes) descriptionParts.push(`Notas: ${notes}`);
      const description = descriptionParts.join(" | ") || null;

      const result = await pg.query(
        `INSERT INTO expenses (organization_id, category, description, amount, expense_date, created_by)
         SELECT $1::uuid, $2::varchar(80), $3::text, $4::numeric(12,2), $5::date, $6::uuid
         WHERE NOT EXISTS (
           SELECT 1 FROM expenses
           WHERE organization_id = $1::uuid
             AND category = $2::varchar(80)
             AND COALESCE(description, '') = COALESCE($3::text, '')
             AND amount = $4::numeric(12,2)
             AND expense_date = $5::date
         )`,
        [organizationId, product, description, amount, expenseDate, userId]
      );
      if (result.rowCount > 0) stats.expenses.inserted += 1;
      else stats.expenses.skipped += 1;
    }

    const cleaningServices = docs.cleaningServices || [];
    stats.services.source += cleaningServices.length;
    stats.orders.source += cleaningServices.length;
    for (const row of cleaningServices) {
      const type = str(row.type || "servico", 40).toLowerCase();
      const serviceName = `Legacy - ${type || "servico"}`;
      const serviceId = await getOrCreateService({
        name: serviceName,
        description: "Recuperado de cleaningServices (Firestore)",
        durationMinutes: Math.max(30, Math.round(Number(row.durationHours || 1) * 60)),
        price: parsePositiveNumber(row.price, 1)
      });

      const clientId = clientIdByLegacyId.get(str(row.clientId, 60)) || (await getOrCreateClientByName(str(row.clientId || "Cliente legacy", 120)));
      const orderStatus = mapOrderStatus(row.status);
      const startAt = parseDateISO(row.startAt, "2026-01-01");
      const amount = parsePositiveNumber(row.price, 1);
      const marker = `legacy_cleaning_id:${str(row.id, 80)}`;
      const extras = Array.isArray(row.extras) ? row.extras.map((x) => str(x, 100)).filter(Boolean) : [];
      const notes = [
        marker,
        row.priority ? `prioridade:${str(row.priority, 40)}` : "",
        row.teamId ? `equipa_legacy:${str(row.teamId, 60)}` : "",
        extras.length ? `extras:${extras.join(", ")}` : ""
      ]
        .filter(Boolean)
        .join(" | ");

      const exists = await pg.query(
        `SELECT id FROM orders WHERE organization_id = $1::uuid AND notes LIKE $2 LIMIT 1`,
        [organizationId, `%${marker}%`]
      );
      if (exists.rows.length) {
        stats.orders.skipped += 1;
      } else {
        await pg.query(
          `INSERT INTO orders (organization_id, client_id, service_id, status, scheduled_at, total_amount, notes)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::order_status, $5::timestamptz, $6::numeric(12,2), $7::text)`,
          [organizationId, clientId, serviceId, orderStatus, startAt, amount, notes]
        );
        stats.orders.inserted += 1;
      }

      const serviceExists = await pg.query(
        `SELECT id FROM services WHERE organization_id = $1::uuid AND lower(name) = $2 LIMIT 1`,
        [organizationId, serviceName.toLowerCase()]
      );
      if (serviceExists.rows.length > 1) stats.services.skipped += 1;
      else if (serviceExists.rows.length === 1) stats.services.inserted += 1;
    }

    const legacyPaymentServiceId = await getOrCreateService({
      name: "Legacy - Pagamentos Recuperados",
      description: "Servico tecnico para recuperar pagamentos legados",
      durationMinutes: 60,
      price: 1
    });

    const legacyPayments = docs.payments || [];
    stats.payments.source = legacyPayments.length;
    stats.orders.source += legacyPayments.length;
    for (const row of legacyPayments) {
      const legacyId = str(row.id, 80);
      const marker = `legacy_payment_id:${legacyId}`;
      const amount = parsePositiveNumber(row.amount, 0);
      if (!legacyId || amount <= 0) {
        stats.payments.skipped += 1;
        continue;
      }

      const clientId = await getOrCreateClientByName(str(row.client || "Cliente legacy", 120));
      const orderStatus = mapOrderStatus(row.status || "paid");
      const paidAtIso = parseDateISO(row.date, "2026-01-01");
      const notes = [
        marker,
        row.concept ? `conceito:${str(row.concept, 120)}` : "",
        row.responsible ? `responsavel:${str(row.responsible, 80)}` : "",
        row.notes ? `notas:${str(row.notes, 300)}` : "",
        row.status ? `estado_legacy:${str(row.status, 40)}` : ""
      ]
        .filter(Boolean)
        .join(" | ");

      let orderId;
      const existingOrder = await pg.query(
        `SELECT id FROM orders WHERE organization_id = $1::uuid AND notes LIKE $2 LIMIT 1`,
        [organizationId, `%${marker}%`]
      );
      if (existingOrder.rows.length) {
        orderId = existingOrder.rows[0].id;
        stats.orders.skipped += 1;
      } else {
        const createdOrder = await pg.query(
          `INSERT INTO orders (organization_id, client_id, service_id, status, scheduled_at, total_amount, notes)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::order_status, $5::timestamptz, $6::numeric(12,2), $7::text)
           RETURNING id`,
          [organizationId, clientId, legacyPaymentServiceId, orderStatus, paidAtIso, amount, notes]
        );
        orderId = createdOrder.rows[0].id;
        stats.orders.inserted += 1;
      }

      const existingPayment = await pg.query(
        `SELECT p.id
         FROM payments p
         WHERE p.order_id = $1::uuid
         LIMIT 1`,
        [orderId]
      );
      if (existingPayment.rows.length) {
        stats.payments.skipped += 1;
        continue;
      }

      await pg.query(
        `INSERT INTO payments (order_id, amount, method, paid_at, reference)
         VALUES ($1::uuid, $2::numeric(12,2), $3::payment_method, $4::timestamptz, $5::varchar(120))`,
        [orderId, amount, mapPaymentMethod(row.method), paidAtIso, str(row.invoiceReceipt, 120) || null]
      );
      stats.payments.inserted += 1;
    }

    await pg.query(
      `UPDATE orders
       SET status = CASE
         WHEN (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.order_id = orders.id) >= orders.total_amount
         THEN 'paid'::order_status
         ELSE status
       END,
       updated_at = NOW()
       WHERE organization_id = $1::uuid`,
      [organizationId]
    );

    const legacySalaries = docs.salaryPayments || [];
    stats.salaries.source = legacySalaries.length;
    for (const row of legacySalaries) {
      const employeeName = str(row.employee, 120);
      const employeeId = await getOrCreateEmployeeByName(employeeName || "Funcionario Legacy");
      const periodMonth = parseMonthToDate(row.month);
      const baseAmount = Math.max(0, Number(row.baseSalary || 0));
      const bonusAmount = Math.max(0, Number(row.extras || 0));
      const discountAmount = Math.max(0, Number(row.deductions || 0));
      const netAmount = Number(Math.max(0, baseAmount + bonusAmount - discountAmount).toFixed(2));

      const upsert = await pg.query(
        `INSERT INTO salaries (organization_id, employee_id, period_month, base_amount, bonus_amount, discount_amount, net_amount)
         VALUES ($1::uuid, $2::uuid, $3::date, $4::numeric(12,2), $5::numeric(12,2), $6::numeric(12,2), $7::numeric(12,2))
         ON CONFLICT (employee_id, period_month) DO NOTHING`,
        [organizationId, employeeId, periodMonth, baseAmount, bonusAmount, discountAmount, netAmount]
      );
      if (upsert.rowCount > 0) stats.salaries.inserted += 1;
      else stats.salaries.skipped += 1;
    }

    const legacyDistributions = docs.material_distribution || [];
    stats.materialMovements.source = legacyDistributions.length;
    for (const row of legacyDistributions) {
      const productName = str(row.product, 120);
      const materialId = await getOrCreateMaterialByName(productName || "Material Legacy");
      const qty = parsePositiveNumber(row.deliveredQty, 0);
      if (qty <= 0) {
        stats.materialMovements.skipped += 1;
        continue;
      }
      const marker = `legacy_distribution_id:${str(row.id, 80)}`;
      const note = [
        marker,
        row.destination ? `destino:${str(row.destination, 120)}` : "",
        row.recipient ? `destinatario:${str(row.recipient, 80)}` : "",
        row.responsible ? `responsavel:${str(row.responsible, 80)}` : "",
        row.notes ? `notas:${str(row.notes, 200)}` : ""
      ]
        .filter(Boolean)
        .join(" | ");

      const exists = await pg.query(
        `SELECT id FROM stock_movements WHERE organization_id = $1::uuid AND note LIKE $2 LIMIT 1`,
        [organizationId, `%${marker}%`]
      );
      if (exists.rows.length) {
        stats.materialMovements.skipped += 1;
      } else {
        await pg.query(
          `INSERT INTO stock_movements (
             organization_id, material_id, type, quantity, note, created_by
           )
           VALUES ($1::uuid, $2::uuid, 'OUT'::stock_movement_type, $3::numeric(14,3), $4::text, $5::uuid)`,
          [organizationId, materialId, qty, note, userId]
        );
        stats.materialMovements.inserted += 1;
      }
    }

    const settingsResult = await pg.query(
      `SELECT socios_percentage, investimentos_percentage, emergencias_percentage, base_percentage
       FROM allocation_settings
       WHERE organization_id = $1::uuid`,
      [organizationId]
    );
    const settings = settingsResult.rows[0] || {
      socios_percentage: 25,
      investimentos_percentage: 25,
      emergencias_percentage: 25,
      base_percentage: 25
    };

    const paymentRows = await pg.query(
      `SELECT p.id, p.amount
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE o.organization_id = $1::uuid`,
      [organizationId]
    );

    for (const row of paymentRows.rows) {
      const values = distributeAmount(Number(row.amount), {
        sociosPercentage: Number(settings.socios_percentage),
        investimentosPercentage: Number(settings.investimentos_percentage),
        emergenciasPercentage: Number(settings.emergencias_percentage),
        basePercentage: Number(settings.base_percentage)
      });
      await pg.query(
        `INSERT INTO financial_allocations (
           organization_id, payment_id, total_amount, socios_amount, investimentos_amount, emergencias_amount, base_amount
         )
         VALUES ($1::uuid, $2::uuid, $3::numeric(12,2), $4::numeric(12,2), $5::numeric(12,2), $6::numeric(12,2), $7::numeric(12,2))
         ON CONFLICT (payment_id)
         DO UPDATE SET
           total_amount = EXCLUDED.total_amount,
           socios_amount = EXCLUDED.socios_amount,
           investimentos_amount = EXCLUDED.investimentos_amount,
           emergencias_amount = EXCLUDED.emergencias_amount,
           base_amount = EXCLUDED.base_amount`,
        [
          organizationId,
          row.id,
          values.totalAmount,
          values.sociosAmount,
          values.investimentosAmount,
          values.emergenciasAmount,
          values.baseAmount
        ]
      );
    }

    await pg.query("COMMIT");

    const out = {
      organizationId,
      userId,
      backup: fullBackupPath,
      unmappedBackup: unmappedPath,
      stats
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out, null, 2));
  } catch (error) {
    await pg.query("ROLLBACK");
    throw error;
  } finally {
    await pg.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
