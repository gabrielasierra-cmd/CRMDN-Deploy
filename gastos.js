(function () {
  const feedback = document.getElementById("mainFeedback");
  const expensesBody = document.getElementById("expensesBody");
  const expensesTotal = document.getElementById("expensesTotal");
  const expensesBankBalance = document.getElementById("expensesBankBalance");
  const expensesMonthFilter = document.getElementById("expensesMonthFilter");
  const expensesSupplierFilter = document.getElementById("expensesSupplierFilter");
  const expensesStatusFilter = document.getElementById("expensesStatusFilter");
  const expenseCount = document.getElementById("expenseCount");
  const filteredExpenseCount = document.getElementById("filteredExpenseCount");

  const saveExpensesBtn = document.getElementById("saveExpensesBtn");
  const monthlyReportBtn = document.getElementById("monthlyReportBtn");
  const addExpenseBtn = document.getElementById("addExpenseBtn");
  const expenseForm = document.getElementById("expenseCreateForm");
  const expenseDate = document.getElementById("expenseDate");
  const expenseProduct = document.getElementById("expenseProduct");
  const expenseSupplier = document.getElementById("expenseSupplier");
  const expenseInvoiceNo = document.getElementById("expenseInvoiceNo");
  const expensePrice = document.getElementById("expensePrice");
  const expenseQuantity = document.getElementById("expenseQuantity");
  const expensePresentation = document.getElementById("expensePresentation");
  const expenseResponsible = document.getElementById("expenseResponsible");
  const expenseNotes = document.getElementById("expenseNotes");
  const monthlyReportModal = document.getElementById("monthlyReportModal");
  const monthlyReportTitle = document.getElementById("monthlyReportTitle");
  const monthlyReportMeta = document.getElementById("monthlyReportMeta");
  const monthlyReportStats = document.getElementById("monthlyReportStats");
  const monthlyReportBody = document.getElementById("monthlyReportBody");
  const monthlyReportFooter = document.getElementById("monthlyReportFooter");

  const filters = {
    month: "",
    supplier: "",
    status: "all"
  };

  let expenses = [];
  let sessionRole = "";
  let monthlyReportPrintData = null;

  function show(message, ok = true) {
    feedback.textContent = message;
    feedback.className = "feedback " + (ok ? "ok" : "err");
  }

  function notifyDashboardChange() {
    window.dispatchEvent(new CustomEvent("crm:remote-sync", { detail: { source: "expenses" } }));
  }

  function money(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number.isFinite(number) ? number : 0);
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function isAdmin() {
    return String(sessionRole || "").toLowerCase() === "admin";
  }

  function monthValue(value) {
    return String(value || "").slice(0, 7);
  }

  function monthLabel(monthKey) {
    const y = Number(String(monthKey || "").slice(0, 4));
    const m = Number(String(monthKey || "").slice(5, 7));
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return monthKey || "-";
    return new Date(y, m - 1, 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  }

  function parseExpenseDescription(rawDescription) {
    const text = String(rawDescription || "");
    const parts = text.split("|").map((p) => p.trim()).filter(Boolean);
    const out = {
      product: "",
      supplier: "",
      invoice: "",
      presentation: "",
      responsible: "",
      notes: ""
    };

    const notes = [];

    parts.forEach((part, index) => {
      const idx = part.indexOf(":");
      if (idx <= 0) {
        if (index === 0 && !out.product) {
          out.product = part;
          return;
        }
        notes.push(part);
        return;
      }

      const key = part.slice(0, idx).trim().toLowerCase();
      const value = part.slice(idx + 1).trim();

      if (key === "fornecedor") {
        out.supplier = value;
        return;
      }
      if (key === "pagamento" || key === "metodo" || key === "type") {
        out.presentation = value;
        return;
      }
      if (key === "fatura" || key === "invoice" || key === "recibo") {
        out.invoice = value;
        return;
      }
      if (key === "responsavel" || key === "responsável" || key === "responsible") {
        out.responsible = value;
        return;
      }
      if (key === "notas" || key === "notes" || key === "nota") {
        notes.push(value);
        return;
      }

      notes.push(part);
    });

    out.notes = notes.join(" | ");
    return out;
  }

  function buildMonthFilter() {
    const years = [...new Set(expenses.map((expense) => {
      const year = Number(String(expense.expenseDate || expense.createdAt || "").slice(0, 4));
      return Number.isFinite(year) ? year : null;
    }).filter((year) => year !== null))].sort((a, b) => b - a);

    const normalizedYears = years.length ? years : [new Date().getFullYear()];
    const months = [];

    normalizedYears.forEach((year) => {
      for (let month = 12; month >= 1; month -= 1) {
        months.push(`${year}-${String(month).padStart(2, "0")}`);
      }
    });

    const latestExpenseMonth = expenses.length
      ? monthValue(expenses[0].expenseDate || expenses[0].createdAt)
      : "";

    if (!filters.month || !months.includes(filters.month)) {
      filters.month = (latestExpenseMonth && months.includes(latestExpenseMonth) ? latestExpenseMonth : months[0]) || monthValue(new Date().toISOString());
    }

    expensesMonthFilter.innerHTML = months.length
      ? months.map((month) => `<option value="${month}" ${filters.month === month ? "selected" : ""}>${monthLabel(month)}</option>`).join("")
      : `<option value="${filters.month}">${monthLabel(filters.month)}</option>`;
  }

  function buildSupplierFilter() {
    const parsed = expenses.map((expense) => parseExpenseDescription(expense.description));
    const names = [...new Set(parsed.map((item) => String(item.supplier || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt"));

    expensesSupplierFilter.innerHTML = [
      `<option value="">Todos os fornecedores</option>`,
      ...names.map((name) => `<option value="${esc(name)}" ${filters.supplier === name ? "selected" : ""}>${esc(name)}</option>`)
    ].join("");
  }

  function applyFilters() {
    return expenses.filter((expense) => {
      const parsed = parseExpenseDescription(expense.description);
      const monthOk = !filters.month || monthValue(expense.expenseDate || expense.createdAt) === filters.month;
      const supplierOk = !filters.supplier || String(parsed.supplier || "").trim() === filters.supplier;
      const statusOk = filters.status === "all" || filters.status === "gasto";
      return monthOk && supplierOk && statusOk;
    });
  }

  function renderTotals(filtered) {
    const total = filtered.reduce((acc, expense) => acc + Number(expense.amount || 0), 0);
    expensesTotal.textContent = money(total);
    expensesBankBalance.textContent = money(total);
    expenseCount.textContent = String(expenses.length);
    filteredExpenseCount.textContent = String(filtered.length);
  }

  function renderRows(filtered) {
    expensesBody.innerHTML = filtered.map((expense) => {
      const parsed = parseExpenseDescription(expense.description);
      const date = expense.expenseDate || expense.createdAt;
      const product = String(expense.category || parsed.product || "-");
      const supplier = String(parsed.supplier || "-");
      const invoice = String(parsed.invoice || "-");
      const presentation = String(parsed.presentation || "Gasto");
      const responsible = String(parsed.responsible || "-");
      const notes = String(parsed.notes || "-");
      return `
        <tr>
          <td>${date ? new Date(date).toLocaleDateString("pt-PT") : "-"}</td>
          <td>${esc(product)}</td>
          <td>${esc(supplier)}</td>
          <td>${esc(invoice)}</td>
          <td>${money(expense.amount)}</td>
          <td>${esc(presentation)}</td>
          <td>${esc(responsible)}</td>
          <td>${esc(notes)}</td>
          <td>Gasto</td>
          <td>
            ${isAdmin() ? `<button type="button" class="payment-delete-btn expense-delete-btn" data-action="delete" data-expense-id="${esc(expense.id)}">Apagar</button>` : "-"}
          </td>
        </tr>
      `;
    }).join("") || "<tr><td colspan='10' class='muted' style='padding:10px'>Sem registos para este filtro.</td></tr>";
  }

  function renderAll() {
    buildMonthFilter();
    buildSupplierFilter();
    const filtered = applyFilters();
    renderTotals(filtered);
    renderRows(filtered);
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
      totalAmount,
      rowCount,
      supplierCount,
      productCount,
      rowsHtml
    } = monthlyReportPrintData;

    const existingFrame = document.getElementById("monthlyReportPrintFrame");
    if (existingFrame) existingFrame.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "monthlyReportPrintFrame";
    iframe.title = "Relatorio mensal de gastos";
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
        <title>Relatorio mensal de gastos | ${esc(monthTitle)}</title>
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
              <div class="kicker">Relatorio mensal de gastos</div>
              <h1>${esc(monthTitle)}</h1>
              <div class="meta">Gerado em ${esc(generatedAt)}</div>
            </div>
            <div class="meta">Fornecedores distintos: ${esc(String(supplierCount))}</div>
          </div>
          <div class="stats">
            <div class="stat"><span>Total filtrado</span><strong>${esc(money(totalAmount))}</strong></div>
            <div class="stat"><span>Registos</span><strong>${esc(String(rowCount))}</strong></div>
            <div class="stat"><span>Produtos</span><strong>${esc(String(productCount))}</strong></div>
            <div class="stat"><span>Fornecedores</span><strong>${esc(String(supplierCount))}</strong></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Fornecedor</th>
                  <th>Factura/Recibo</th>
                  <th>Monto</th>
                  <th>Pagamento</th>
                  <th>Responsavel</th>
                  <th>Observacoes</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          <div class="footer">Registos carregados: ${esc(String(rowCount))}</div>
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
    const filtered = applyFilters();
    const monthKey = filters.month || (filtered[0] && monthValue(filtered[0].expenseDate || filtered[0].createdAt)) || monthValue(new Date().toISOString());
    const monthTitle = monthLabel(monthKey);
    const generatedAt = new Date().toLocaleString("pt-PT");
    const totalAmount = filtered.reduce((acc, expense) => acc + Number(expense.amount || 0), 0);
    const supplierCount = new Set(filtered.map((expense) => String(parseExpenseDescription(expense.description).supplier || "").trim()).filter(Boolean)).size;
    const productCount = new Set(filtered.map((expense) => String(expense.category || parseExpenseDescription(expense.description).product || "").trim()).filter(Boolean)).size;

    const rowsHtml = filtered.length
      ? filtered.map((expense) => {
          const parsed = parseExpenseDescription(expense.description);
          const date = expense.expenseDate || expense.createdAt;
          return `
            <tr>
              <td>${date ? new Date(date).toLocaleDateString("pt-PT") : "-"}</td>
              <td>${esc(String(expense.category || parsed.product || "-"))}</td>
              <td>${esc(String(parsed.supplier || "-"))}</td>
              <td>${esc(String(parsed.invoice || "-"))}</td>
              <td>${money(expense.amount)}</td>
              <td>${esc(String(parsed.presentation || "Gasto"))}</td>
              <td>${esc(String(parsed.responsible || "-"))}</td>
              <td>${esc(String(parsed.notes || "-"))}</td>
              <td>Gasto</td>
            </tr>
          `;
        }).join("")
      : "<tr><td colspan='9'>Sem registos para este filtro.</td></tr>";

    if (!monthlyReportModal || !monthlyReportTitle || !monthlyReportMeta || !monthlyReportStats || !monthlyReportBody || !monthlyReportFooter) {
      show("Nao foi possivel abrir o relatorio.", false);
      return;
    }

    monthlyReportTitle.textContent = monthTitle;
    monthlyReportMeta.textContent = `Gerado em ${generatedAt}`;
    monthlyReportStats.innerHTML = [
      { label: "Total filtrado", value: money(totalAmount) },
      { label: "Registos", value: String(filtered.length) },
      { label: "Produtos", value: String(productCount) },
      { label: "Fornecedores", value: String(supplierCount) }
    ].map((item) => `
      <article class="report-stat">
        <span>${esc(item.label)}</span>
        <strong>${esc(item.value)}</strong>
      </article>
    `).join("");
    monthlyReportBody.innerHTML = rowsHtml;
    monthlyReportFooter.textContent = `Registos carregados: ${String(filtered.length)}`;
    monthlyReportModal.hidden = false;
    document.body.style.overflow = "hidden";
    monthlyReportPrintData = {
      monthTitle,
      generatedAt,
      totalAmount,
      rowCount: filtered.length,
      supplierCount,
      productCount,
      rowsHtml
    };
  }

  async function loadAllData() {
    const payload = await window.CRMApi.getFinancialExpenses({ page: 1, pageSize: 500 });
    expenses = payload.items || [];
  }

  function resetForm() {
    expenseForm.reset();
    expenseQuantity.value = "1";
    expensePresentation.value = "";
  }

  async function createExpense(event) {
    event.preventDefault();

    const payload = {
      expenseDate: expenseDate.value,
      product: expenseProduct.value.trim(),
      supplier: expenseSupplier.value.trim(),
      invoiceNo: expenseInvoiceNo.value.trim(),
      price: Number(String(expensePrice.value || "0").replace(",", ".")),
      quantity: Number(expenseQuantity.value || 1),
      presentation: expensePresentation.value.trim(),
      responsible: expenseResponsible.value.trim(),
      notes: expenseNotes.value.trim()
    };

    if (!payload.expenseDate || !payload.product || !payload.presentation || !Number.isFinite(payload.price) || payload.price <= 0) {
      show("Data, produto, preco e metodo sao obrigatorios.", false);
      return;
    }

    try {
      await window.CRMApi.createFinancialExpense(payload);
      filters.month = payload.expenseDate.slice(0, 7);
      await loadAllData();
      renderAll();
      resetForm();
      show("Gasto registado com sucesso.", true);
      notifyDashboardChange();
    } catch (error) {
      show(error && error.message ? error.message : "Falha ao registar gasto.", false);
    }
  }

  async function deleteExpense(expenseId) {
    if (!confirm("Confirmas a eliminacao deste gasto?")) return;

    try {
      await window.CRMApi.deleteFinancialExpense(expenseId);
      await loadAllData();
      renderAll();
      show("Gasto eliminado com sucesso.", true);
      notifyDashboardChange();
    } catch (error) {
      show(error && error.message ? error.message : "Falha ao eliminar gasto.", false);
    }
  }

  async function bootstrap() {
    const session = await window.CRMAuth.ensureAuth();
    if (!session) return;
    sessionRole = session.role || "";

    window.CRMAuth.bindLogout();

    saveExpensesBtn.addEventListener("click", async () => {
      try {
        await loadAllData();
        renderAll();
        show("Dados sincronizados com a API.", true);
        notifyDashboardChange();
      } catch (error) {
        show(error && error.message ? error.message : "Falha ao carregar gastos.", false);
      }
    });

    if (monthlyReportBtn) {
      monthlyReportBtn.addEventListener("click", openMonthlyReport);
    }

    addExpenseBtn.addEventListener("click", () => {
      expenseDate.focus();
      expenseForm.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    expenseForm.addEventListener("submit", createExpense);

    expensesBody.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action='delete']");
      if (!button) return;
      const expenseId = button.dataset.expenseId;
      if (!expenseId) return;
      await deleteExpense(expenseId);
    });

    expensesMonthFilter.addEventListener("change", () => {
      filters.month = expensesMonthFilter.value;
      renderAll();
    });

    expensesSupplierFilter.addEventListener("change", () => {
      filters.supplier = expensesSupplierFilter.value;
      renderAll();
    });

    expensesStatusFilter.addEventListener("change", () => {
      filters.status = expensesStatusFilter.value;
      renderAll();
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

    try {
      await loadAllData();
      renderAll();
    } catch (error) {
      show(error && error.message ? error.message : "Falha ao carregar gastos.", false);
    }
  }

  bootstrap();
})();
