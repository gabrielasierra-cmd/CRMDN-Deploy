(async function () {
  const session = await CRMAuth.ensureAuth();
  if (!session) return;
  CRM.ensureEmployees();
  CRMAuth.bindLogout();

  const STORAGE_KEY = CRM.K.salaryPayments || "salaryPayments";
  const EMPTY_ROWS = 8;

  const feedback = document.getElementById("mainFeedback");
  const salaryBody = document.getElementById("salaryBody");
  const salaryTotalPaid = document.getElementById("salaryTotalPaid");
  const salaryMonthFilter = document.getElementById("salaryMonthFilter");
  const salaryEmployeeFilter = document.getElementById("salaryEmployeeFilter");
  const salaryStatusFilter = document.getElementById("salaryStatusFilter");
  const salaryPaidCount = document.getElementById("salaryPaidCount");
  const salaryPendingCount = document.getElementById("salaryPendingCount");
  const employeeOptions = document.getElementById("employeeOptions");
  const addSalaryRowBtn = document.getElementById("addSalaryRowBtn");
  const monthlyReportBtn = document.getElementById("monthlyReportBtn");
  const clearSalaryBtn = document.getElementById("clearSalaryBtn");
  const monthlyReportModal = document.getElementById("monthlyReportModal");
  const monthlyReportTitle = document.getElementById("monthlyReportTitle");
  const monthlyReportMeta = document.getElementById("monthlyReportMeta");
  const monthlyReportStats = document.getElementById("monthlyReportStats");
  const monthlyReportBody = document.getElementById("monthlyReportBody");
  const monthlyReportFooter = document.getElementById("monthlyReportFooter");

  const filters = { month: "", employee: "", status: "all" };
  let monthlyReportPrintData = null;

  function show(msg, ok) {
    feedback.textContent = msg;
    feedback.className = "feedback " + (ok ? "ok" : "err");
  }

  function notifyDashboardChange() {
    window.dispatchEvent(new CustomEvent("crm:remote-sync", { detail: { source: "salaries" } }));
  }

  function escAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function parseNumber(raw) {
    const n = Number(String(raw || "").replace(",", "."));
    return Number.isFinite(n) ? +n.toFixed(2) : 0;
  }

  function readRows() {
    return CRM.read(STORAGE_KEY, []);
  }

  function writeRows(rows) {
    CRM.write(STORAGE_KEY, rows);
  }

  function monthValue(value) {
    return String(value || "").slice(0, 7);
  }

  function dateValue(value) {
    return String(value || "").slice(0, 10);
  }

  function createRow(defaultMonth) {
    const now = new Date();
    const month = monthValue(defaultMonth) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return {
      id: CRM.uid(),
      month: month,
      employee: "",
      baseSalary: 0,
      extras: 0,
      deductions: 0,
      paidAt: "",
      status: "pendente",
      notes: ""
    };
  }

  function normalize(rows) {
    let changed = false;
    const out = rows.map((r) => {
      const status = r.status === "pago" ? "pago" : "pendente";
      if (status !== r.status) changed = true;
      return { ...r, status };
    });
    if (changed) {
      writeRows(out);
      notifyDashboardChange();
    }
    return out;
  }

  function buildEmployeeOptions(rows) {
    const employeeNames = CRM.read(CRM.K.employees, []).map((e) => String(e.name || "").trim());
    const rowNames = rows.map((r) => String(r.employee || "").trim());
    const names = [...new Set([...employeeNames, ...rowNames].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));
    employeeOptions.innerHTML = names.map((n) => `<option value="${escAttr(n)}"></option>`).join("");
    salaryEmployeeFilter.innerHTML = `<option value="">Todos os funcionarios</option>${names.map((n) => `<option value="${escAttr(n)}" ${filters.employee === n ? "selected" : ""}>${n}</option>`).join("")}`;
  }

  function monthLabel(monthKey) {
    const y = Number(monthKey.slice(0, 4));
    const m = Number(monthKey.slice(5, 7));
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return monthKey;
    return new Date(y, m - 1, 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  }

  function buildMonthFilter(rows) {
    const startYear = 2025;
    const endYear = 2026;
    const fixedMonths = [];
    for (let year = startYear; year <= endYear; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const key = `${year}-${String(month).padStart(2, "0")}`;
        fixedMonths.push(key);
      }
    }
    const months = fixedMonths.filter((m) => m >= "2025-07" && m <= "2026-12");

    if (!filters.month || !months.includes(filters.month)) {
      filters.month = months[0] || "";
    }

    salaryMonthFilter.innerHTML = months
      .map((m) => `<option value="${m}" ${filters.month === m ? "selected" : ""}>${monthLabel(m)}</option>`)
      .join("");
  }

  function rowTotal(row) {
    return +(parseNumber(row.baseSalary) + parseNumber(row.extras) - parseNumber(row.deductions)).toFixed(2);
  }

  function applyFilters(rows) {
    return rows
      .filter((r) => {
      const monthOk = !filters.month || monthValue(r.month) === filters.month;
      const employeeOk = !filters.employee || String(r.employee || "").trim() === filters.employee;
      const statusOk = filters.status === "all" || r.status === filters.status;
      return monthOk && employeeOk && statusOk;
    })
      .sort((a, b) => {
        const byMonth = monthValue(b.month).localeCompare(monthValue(a.month));
        if (byMonth !== 0) return byMonth;
        return String(a.employee || "").localeCompare(String(b.employee || ""), "pt");
      });
  }

  function updateSummary(allRows, viewRows) {
    const paidCount = allRows.filter((r) => r.status === "pago").length;
    const pendingCount = allRows.length - paidCount;
    salaryPaidCount.textContent = String(paidCount);
    salaryPendingCount.textContent = String(pendingCount);
    const totalPaid = viewRows.filter((r) => r.status === "pago").reduce((acc, r) => acc + rowTotal(r), 0);
    salaryTotalPaid.textContent = CRM.money(totalPaid);
  }

  function input(id, field, type, value, extra) {
    return `<input data-id="${id}" data-field="${field}" type="${type}" value="${escAttr(value)}" ${extra || ""}>`;
  }

  function statusSelect(id, value) {
    return `
      <select data-id="${id}" data-field="status">
        <option value="pendente" ${value === "pendente" ? "selected" : ""}>Pendente</option>
        <option value="pago" ${value === "pago" ? "selected" : ""}>Pago</option>
      </select>
    `;
  }

  function render() {
    const allRows = normalize(readRows());
    buildMonthFilter(allRows);
    buildEmployeeOptions(allRows);
    const rows = applyFilters(allRows);
    updateSummary(allRows, rows);

    const html = rows.map((r) => `
      <tr data-id="${r.id}">
        <td>${input(r.id, "month", "month", monthValue(r.month))}</td>
        <td>${input(r.id, "employee", "text", r.employee || "", 'list="employeeOptions" placeholder="Funcionario"')}</td>
        <td>${input(r.id, "baseSalary", "text", parseNumber(r.baseSalary).toFixed(2), 'inputmode="decimal" placeholder="0,00"')}</td>
        <td>${input(r.id, "extras", "text", parseNumber(r.extras).toFixed(2), 'inputmode="decimal" placeholder="0,00"')}</td>
        <td>${input(r.id, "deductions", "text", parseNumber(r.deductions).toFixed(2), 'inputmode="decimal" placeholder="0,00"')}</td>
        <td class="salary-total-cell">${CRM.money(rowTotal(r))}</td>
        <td>${input(r.id, "paidAt", "date", dateValue(r.paidAt))}</td>
        <td>${statusSelect(r.id, r.status || "pendente")}</td>
        <td>${input(r.id, "notes", "text", r.notes || "", 'placeholder="Observacoes"')}</td>
        <td>
          <button type="button" class="danger salary-action-btn" data-action="delete" data-id="${r.id}">Remover</button>
        </td>
      </tr>
    `).join("");

    const emptyState = rows.length ? "" : "<tr><td colspan='10' class='muted' style='padding:10px'>Sem registos para este filtro.</td></tr>";
    const blanks = Array.from({ length: Math.max(0, EMPTY_ROWS - rows.length) }, () => `
      <tr class="salary-empty-row">
        <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
      </tr>
    `).join("");

    salaryBody.innerHTML = html + emptyState + blanks;
  }

  function closeMonthlyReport() {
    if (!monthlyReportModal) return;
    monthlyReportModal.hidden = true;
    document.body.style.overflow = "";
  }

  function printMonthlyReportIframe() {
    if (!monthlyReportPrintData) {
      show("Abre primeiro o relatorio antes de imprimir.", false);
      return;
    }

    const {
      monthTitle,
      generatedAt,
      totalPaid,
      paidCount,
      pendingCount,
      employeeCount,
      rowsHtml
    } = monthlyReportPrintData;

    const existingFrame = document.getElementById("monthlyReportPrintFrame");
    if (existingFrame) existingFrame.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "monthlyReportPrintFrame";
    iframe.title = "Relatorio mensal de salarios";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.inset = "0";
    iframe.style.width = "100vw";
    iframe.style.height = "100vh";
    iframe.style.border = "0";
    iframe.style.background = "#fff";
    iframe.style.opacity = "1";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "9999";

    const html = `<!doctype html>
      <html lang="pt-PT">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Relatorio mensal de salarios | ${escAttr(monthTitle)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; color: #10233b; background: #fff; }
          .page { padding: 0; }
          .header { display: flex; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 2px solid #d7e4f1; }
          .kicker { color: #5d7087; font-size: .9rem; }
          h1 { margin: 4px 0 6px; font-size: 1.55rem; }
          .meta { color: #5d7087; font-size: .82rem; }
          .stats { margin-top: 14px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
          .stat { border: 1px solid #d7e4f1; border-radius: 12px; background: #fff; padding: 10px 12px; }
          .stat span { display: block; font-size: .76rem; color: #5d7087; margin-bottom: 5px; }
          .stat strong { font-size: 1.15rem; }
          .table-wrap { margin-top: 14px; border: 1px solid #d7e4f1; border-radius: 12px; overflow: hidden; }
          table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
          th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e4edf6; vertical-align: top; }
          th { background: #86c74f; color: #103116; }
          tbody tr:nth-child(even) { background: #fafcff; }
          .footer { margin-top: 10px; color: #5d7087; font-size: .8rem; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div>
              <div class="kicker">Relatorio mensal de salarios</div>
              <h1>${escAttr(monthTitle)}</h1>
              <div class="meta">Gerado em ${escAttr(generatedAt)}</div>
            </div>
            <div class="meta">Colaboradores distintos: ${escAttr(String(employeeCount))}</div>
          </div>
          <div class="stats">
            <div class="stat"><span>Total pago</span><strong>${escAttr(CRM.money(totalPaid))}</strong></div>
            <div class="stat"><span>Registos</span><strong>${escAttr(String(paidCount + pendingCount))}</strong></div>
            <div class="stat"><span>Pagos</span><strong>${escAttr(String(paidCount))}</strong></div>
            <div class="stat"><span>Pendentes</span><strong>${escAttr(String(pendingCount))}</strong></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Funcionario</th>
                  <th>Salario Base</th>
                  <th>Extras</th>
                  <th>Deducoes</th>
                  <th>Total</th>
                  <th>Data Pagamento</th>
                  <th>Estado</th>
                  <th>Observacoes</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          <div class="footer">Registos carregados: ${escAttr(String(paidCount + pendingCount))}</div>
        </div>
      </body>
      </html>`;

    document.body.appendChild(iframe);
    iframe.addEventListener("load", () => {
      try {
        const win = iframe.contentWindow;
        if (!win) return;
        win.requestAnimationFrame(() => {
          win.requestAnimationFrame(() => {
            try {
              win.focus();
              win.print();
            } catch (_error) {
              show("Nao foi possivel preparar a impressao.", false);
            }
          });
        });
      } catch (_error) {
        show("Nao foi possivel preparar a impressao.", false);
      }
    }, { once: true });
    iframe.srcdoc = html;
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 120000);
  }

  function openMonthlyReport() {
    const allRows = normalize(readRows());
    const rows = applyFilters(allRows);
    const monthKey = filters.month || (rows[0] && monthValue(rows[0].month)) || monthValue(new Date().toISOString());
    const monthTitle = monthLabel(monthKey);
    const generatedAt = new Date().toLocaleString("pt-PT");
    const totalPaid = rows.filter((r) => r.status === "pago").reduce((acc, r) => acc + rowTotal(r), 0);
    const paidCount = rows.filter((r) => r.status === "pago").length;
    const pendingCount = rows.length - paidCount;
    const employeeCount = new Set(rows.map((r) => String(r.employee || "").trim()).filter(Boolean)).size;

    const rowsHtml = rows.length
      ? rows.map((r) => `
        <tr>
          <td>${escAttr(monthLabel(monthValue(r.month)))}</td>
          <td>${escAttr(r.employee || "-")}</td>
          <td>${escAttr(CRM.money(parseNumber(r.baseSalary)))}</td>
          <td>${escAttr(CRM.money(parseNumber(r.extras)))}</td>
          <td>${escAttr(CRM.money(parseNumber(r.deductions)))}</td>
          <td>${escAttr(CRM.money(rowTotal(r)))}</td>
          <td>${escAttr(dateValue(r.paidAt) ? new Date(dateValue(r.paidAt)).toLocaleDateString("pt-PT") : "-")}</td>
          <td>${escAttr(r.status || "pendente")}</td>
          <td>${escAttr(r.notes || "-")}</td>
        </tr>
      `).join("")
      : "<tr><td colspan='9'>Sem registos para este filtro.</td></tr>";

    if (!monthlyReportModal || !monthlyReportTitle || !monthlyReportMeta || !monthlyReportStats || !monthlyReportBody || !monthlyReportFooter) {
      show("Nao foi possivel abrir o relatorio.", false);
      return;
    }

    monthlyReportTitle.textContent = monthTitle;
    monthlyReportMeta.textContent = `Gerado em ${generatedAt}`;
    monthlyReportStats.innerHTML = [
      { label: "Total pago", value: CRM.money(totalPaid) },
      { label: "Registos", value: String(rows.length) },
      { label: "Pagos", value: String(paidCount) },
      { label: "Pendentes", value: String(pendingCount) }
    ].map((item) => `
      <article class="report-stat">
        <span>${escAttr(item.label)}</span>
        <strong>${escAttr(item.value)}</strong>
      </article>
    `).join("");
    monthlyReportBody.innerHTML = rowsHtml;
    monthlyReportFooter.textContent = `Colaboradores distintos: ${String(employeeCount)}`;
    monthlyReportModal.hidden = false;
    document.body.style.overflow = "hidden";
    monthlyReportPrintData = {
      monthTitle,
      generatedAt,
      totalPaid,
      paidCount,
      pendingCount,
      employeeCount,
      rowsHtml
    };
  }

  function updateRow(id, field, value) {
    const rows = readRows();
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (field === "baseSalary" || field === "extras" || field === "deductions") row[field] = parseNumber(value);
    else if (field === "month") row.month = monthValue(value);
    else if (field === "paidAt") row.paidAt = dateValue(value);
    else row[field] = String(value || "").trim();
    writeRows(rows);
    render();
    notifyDashboardChange();
  }

  addSalaryRowBtn.addEventListener("click", () => {
    const rows = readRows();
    const selectedMonth = filters.month || monthValue(new Date().toISOString());
    rows.push(createRow(selectedMonth));
    writeRows(rows);
    render();
    show("Linha de salario adicionada.", true);
    notifyDashboardChange();
  });

  clearSalaryBtn.addEventListener("click", () => {
    if (!confirm("Quer apagar todos os registos de salarios?")) return;
    writeRows([createRow()]);
    render();
    show("Registos limpos.", true);
    notifyDashboardChange();
  });

  if (monthlyReportBtn) {
    monthlyReportBtn.addEventListener("click", openMonthlyReport);
  }

  salaryEmployeeFilter.addEventListener("change", () => {
    filters.employee = salaryEmployeeFilter.value;
    render();
  });

  salaryMonthFilter.addEventListener("change", () => {
    filters.month = salaryMonthFilter.value;
    render();
  });

  salaryStatusFilter.addEventListener("change", () => {
    filters.status = salaryStatusFilter.value;
    render();
  });

  if (monthlyReportModal) {
    monthlyReportModal.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-report-close], [data-report-print]");
      if (!trigger) return;
      if (trigger.hasAttribute("data-report-print")) {
        printMonthlyReportIframe();
        return;
      }
      closeMonthlyReport();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && monthlyReportModal && !monthlyReportModal.hidden) {
      closeMonthlyReport();
    }
  });

  salaryBody.addEventListener("input", () => {});

  salaryBody.addEventListener("change", (e) => {
    const field = e.target.dataset.field;
    const id = e.target.dataset.id;
    if (!field || !id) return;
    updateRow(id, field, e.target.value);
  });

  salaryBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !btn.dataset.action) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action !== "delete") return;
    const rows = readRows().filter((r) => r.id !== id);
    writeRows(rows);
    render();
    show("Linha apagada.", true);
    notifyDashboardChange();
  });

  if (!readRows().length) {
    writeRows([createRow()]);
    notifyDashboardChange();
  }
  render();
  window.addEventListener("crm:remote-sync", render);
})();
