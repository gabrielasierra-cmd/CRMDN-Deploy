(function () {
  const feedback = document.getElementById("mainFeedback");
  const paymentsBody = document.getElementById("paymentsBody");
  const paymentsTotal = document.getElementById("paymentsTotal");
  const paymentsBankBalance = document.getElementById("paymentsBankBalance");
  const paymentsMonthFilter = document.getElementById("paymentsMonthFilter");
  const paymentsClientFilter = document.getElementById("paymentsClientFilter");
  const paymentsStatusFilter = document.getElementById("paymentsStatusFilter");
  const paidCount = document.getElementById("paidCount");
  const pendingCount = document.getElementById("pendingCount");

  const addPaymentRowBtn = document.getElementById("addPaymentRowBtn");
  const savePaymentsBtn = document.getElementById("savePaymentsBtn");
  const monthlyReportBtn = document.getElementById("monthlyReportBtn");
  const clearPaymentsBtn = document.getElementById("clearPaymentsBtn");
  const monthlyReportModal = document.getElementById("monthlyReportModal");
  const monthlyReportTitle = document.getElementById("monthlyReportTitle");
  const monthlyReportMeta = document.getElementById("monthlyReportMeta");
  const monthlyReportStats = document.getElementById("monthlyReportStats");
  const monthlyReportBody = document.getElementById("monthlyReportBody");
  const monthlyReportFooter = document.getElementById("monthlyReportFooter");

  const paymentForm = document.getElementById("paymentCreateForm");
  const paymentOrderSelect = document.getElementById("paymentOrderId");
  const paymentMonthInput = document.getElementById("paymentMonth");
  const paymentSubmitBtn = document.getElementById("paymentSubmitBtn");
  const cancelPaymentEditBtn = document.getElementById("cancelPaymentEditBtn");
  const paymentEditNotice = document.getElementById("paymentEditNotice");

  let payments = [];
  let orders = [];
  let editingPaymentId = "";
  let monthlyReportPrintData = null;

  const filters = {
    month: "",
    client: "",
    status: "all"
  };

  function show(message, ok = true) {
    feedback.textContent = message;
    feedback.className = "feedback " + (ok ? "ok" : "err");
  }

  function notifyDashboardChange() {
    window.dispatchEvent(new CustomEvent("crm:remote-sync", { detail: { source: "payments" } }));
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

  function cleanPlaceName(value) {
    return String(value || "")
      .replace(/\blegacy\b/gi, "")
      .replace(/\s*[-|]\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function humanMethod(value) {
    const key = String(value || "").toLowerCase();
    if (key === "mbway") return "MBWay";
    if (key === "transfer") return "Transferencia";
    if (key === "card") return "Cartao";
    if (key === "cash") return "Cash";
    return value || "-";
  }

  function parseLegacyNotes(rawNotes) {
    const text = String(rawNotes || "");
    const parts = text.split("|").map((p) => p.trim()).filter(Boolean);
    const out = {
      isLegacy: false,
      concept: "",
      responsible: "",
      notes: ""
    };

    const cleanNotes = [];

    parts.forEach((part) => {
      const idx = part.indexOf(":");
      if (idx <= 0) {
        cleanNotes.push(part);
        return;
      }

      const key = part.slice(0, idx).trim().toLowerCase();
      const value = part.slice(idx + 1).trim();

      if (key === "legacy_payment_id" || key === "legacy_cleaning_id" || key === "estado_legacy") {
        out.isLegacy = true;
        return;
      }

      if (key === "conceito" || key === "concept") {
        out.concept = value;
        return;
      }

      if (key === "responsavel" || key === "responsável" || key === "responsible") {
        out.responsible = value;
        return;
      }

      if (key === "notas" || key === "nota" || key === "notes") {
        cleanNotes.push(value);
        return;
      }

      cleanNotes.push(part);
    });

    out.notes = cleanNotes.join(" | ");
    return out;
  }

  function monthValue(value) {
    return String(value || "").slice(0, 7);
  }

  function monthLabel(monthKey) {
    const y = Number(String(monthKey || "").slice(0, 4));
    const m = Number(String(monthKey || "").slice(5, 7));
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return monthKey;
    return new Date(y, m - 1, 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  }

  function currentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function paidAtForMonth(monthKey) {
    const normalizedMonth = String(monthKey || "").slice(0, 7);
    const year = Number(normalizedMonth.slice(0, 4));
    const month = Number(normalizedMonth.slice(5, 7));
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return new Date().toISOString();
    }

    return new Date(Date.UTC(year, month - 1, 15, 12, 0, 0)).toISOString();
  }

  function buildMonthKeys() {
    const years = [...new Set(payments.map((payment) => {
      const monthKey = monthValue(payment.paid_at || payment.created_at);
      const year = Number(monthKey.slice(0, 4));
      return Number.isFinite(year) ? year : null;
    }).filter((year) => year !== null))].sort((a, b) => b - a);

    const normalizedYears = years.length ? years : [new Date().getFullYear()];
    const months = [];

    normalizedYears.forEach((year) => {
      for (let month = 12; month >= 1; month -= 1) {
        months.push(`${year}-${String(month).padStart(2, "0")}`);
      }
    });

    return months;
  }

  function buildOrderMap() {
    return Object.fromEntries(orders.map((order) => [order.id, order]));
  }

  function getPaymentMonth(payment) {
    return monthValue(payment.paid_at || payment.created_at);
  }

  function stopEditingPayment() {
    editingPaymentId = "";
    paymentSubmitBtn.textContent = "Registar pagamento";
    cancelPaymentEditBtn.style.display = "none";
    paymentEditNotice.style.display = "none";
    paymentEditNotice.textContent = "";
  }

  function startEditingPayment(payment) {
    editingPaymentId = payment.id;
    paymentOrderSelect.value = payment.order_id || "";
    paymentMonthInput.value = getPaymentMonth(payment) || currentMonthValue();
    document.getElementById("paymentAmount").value = Number(payment.amount || 0).toFixed(2);
    document.getElementById("paymentMethod").value = payment.method || "";
    document.getElementById("paymentReference").value = payment.reference || "";
    paymentSubmitBtn.textContent = "Guardar alteracoes";
    cancelPaymentEditBtn.style.display = "inline-block";
    paymentEditNotice.style.display = "block";
    paymentEditNotice.textContent = `A editar pagamento de ${cleanPlaceName(buildOrderMap()[payment.order_id]?.client_name || "") || "cliente"}.`;
    paymentOrderSelect.focus();
  }

  function resetPaymentFormState() {
    paymentForm.reset();
    paymentMonthInput.value = currentMonthValue();
    stopEditingPayment();
  }

  function buildOrderSelect() {
    paymentOrderSelect.innerHTML = [
      "<option value=''>Selecionar ordem</option>",
      ...orders.map((order) => {
        const label = cleanPlaceName(order.client_name) || cleanPlaceName(order.service_name) || "Cliente";
        return `<option value="${order.id}">${esc(label)}</option>`;
      })
    ].join("");
  }

  function buildMonthFilter() {
    const months = buildMonthKeys();
    const latestPaymentMonth = payments
      .map((payment) => monthValue(payment.paid_at || payment.created_at))
      .find((month) => month && months.includes(month)) || monthValue(new Date().toISOString());

    if (!filters.month || !months.includes(filters.month)) {
      filters.month = (latestPaymentMonth && months.includes(latestPaymentMonth) ? latestPaymentMonth : months[0]) || monthValue(new Date().toISOString());
    }

    paymentsMonthFilter.innerHTML = months.map((month) => `<option value="${month}" ${filters.month === month ? "selected" : ""}>${monthLabel(month)}</option>`).join("");
  }

  function buildClientFilter(orderMap) {
    const names = [...new Set(payments.map((payment) => {
      const order = orderMap[payment.order_id];
      return order ? String(order.client_name || "").trim() : "";
    }).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));

    paymentsClientFilter.innerHTML = [
      `<option value="">Todos os clientes</option>`,
      ...names.map((name) => `<option value="${esc(name)}" ${filters.client === name ? "selected" : ""}>${esc(name)}</option>`)
    ].join("");
  }

  function applyFilters(orderMap) {
    return payments.filter((payment) => {
      const order = orderMap[payment.order_id];
      const paidAt = payment.paid_at || payment.created_at;
      const monthOk = !filters.month || monthValue(paidAt) === filters.month;

      const clientName = order ? String(order.client_name || "").trim() : "";
      const clientOk = !filters.client || clientName === filters.client;

      const derivedStatus = order && String(order.status || "").toLowerCase() === "paid" ? "pago" : "pendente";
      const statusOk = filters.status === "all" || filters.status === derivedStatus;

      return monthOk && clientOk && statusOk;
    });
  }

  function renderTotals(filtered, orderMap) {
    const total = filtered.reduce((acc, payment) => acc + Number(payment.amount || 0), 0);
    paymentsTotal.textContent = money(total);

    const paid = filtered.filter((payment) => {
      const order = orderMap[payment.order_id];
      return order && String(order.status || "").toLowerCase() === "paid";
    }).length;

    paidCount.textContent = String(paid);
    pendingCount.textContent = String(Math.max(filtered.length - paid, 0));

    paymentsBankBalance.textContent = money(total);
    paymentsBankBalance.className = total >= 0 ? "ok" : "err";
  }

  function renderRows(filtered, orderMap) {
    paymentsBody.innerHTML = filtered.map((payment) => {
      const order = orderMap[payment.order_id];
      const paidAt = payment.paid_at || payment.created_at;
      const status = order && String(order.status || "").toLowerCase() === "paid" ? "Pago" : "Pendente";
      const parsed = parseLegacyNotes(order ? order.notes : "");
      const concept = parsed.concept || (order ? order.service_name : "-");
      const responsible = parsed.responsible || (order ? order.employee_name || "-" : "-");
      const noteText = parsed.notes || (parsed.isLegacy ? "Registo recuperado." : (order ? order.notes || "-" : "-"));
      return `
        <tr>
          <td>${paidAt ? new Date(paidAt).toLocaleDateString("pt-PT") : "-"}</td>
          <td>${esc(order ? order.client_name : "-")}</td>
          <td>${esc(humanMethod(payment.method))}</td>
          <td>${esc(payment.reference || "-")}</td>
          <td>${money(payment.amount)}</td>
          <td>${esc(concept || "-")}</td>
          <td>${esc(responsible || "-")}</td>
          <td>${esc(noteText || "-")}</td>
          <td>${status}</td>
          <td>
            <button type="button" class="secondary payment-edit-btn" data-action="edit" data-payment-id="${esc(payment.id)}">Corrigir</button>
            <button type="button" class="danger payment-delete-btn" data-action="delete" data-payment-id="${esc(payment.id)}">Eliminar</button>
          </td>
        </tr>
      `;
    }).join("") || "<tr><td colspan='10' class='muted' style='padding:10px'>Sem registos para este filtro.</td></tr>";
  }

  function closeMonthlyReport() {
    if (!monthlyReportModal) return;
    monthlyReportModal.hidden = true;
    document.body.style.overflow = "";
  }

  function printMonthlyReport() {
    if (!monthlyReportPrintData) {
      show("Abre primeiro o relatorio antes de imprimir.", false);
      return;
    }

    const {
      monthTitle,
      generatedAt,
      clientCount,
      totalAmount,
      paidCountValue,
      pendingCountValue,
      paymentCount,
      rowsHtml
    } = monthlyReportPrintData;

    const iframe = document.createElement("iframe");
    iframe.id = "monthlyReportPrintFrame";
    iframe.title = "Relatorio mensal";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "0";
    iframe.style.width = "1200px";
    iframe.style.height = "1600px";
    iframe.style.border = "0";
    iframe.style.opacity = "0.01";
    iframe.style.pointerEvents = "none";

    const cleanupIframe = () => {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch (_error) {
        // ignore
      }
    };

    const html = `<!doctype html>
      <html lang="pt-PT">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Relatorio mensal | ${esc(monthTitle)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body {
            margin: 0;
            font-family: "Segoe UI", Tahoma, sans-serif;
            color: #10233b;
            background: #fff;
          }
          .page { padding: 0; }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            padding-bottom: 12px;
            border-bottom: 2px solid #d7e4f1;
          }
          .kicker { color: #5d7087; font-size: .9rem; }
          h1 { margin: 4px 0 6px; font-size: 1.55rem; }
          .meta { color: #5d7087; font-size: .82rem; }
          .stats {
            margin-top: 14px;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
          }
          .stat {
            border: 1px solid #d7e4f1;
            border-radius: 12px;
            background: #fff;
            padding: 10px 12px;
          }
          .stat span {
            display: block;
            font-size: .76rem;
            color: #5d7087;
            margin-bottom: 5px;
          }
          .stat strong { font-size: 1.15rem; }
          .table-wrap {
            margin-top: 14px;
            border: 1px solid #d7e4f1;
            border-radius: 12px;
            overflow: hidden;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10.5px;
          }
          th, td {
            padding: 8px 10px;
            text-align: left;
            border-bottom: 1px solid #e4edf6;
            vertical-align: top;
          }
          th {
            background: #86c74f;
            color: #103116;
          }
          tbody tr:nth-child(even) { background: #fafcff; }
          .footer {
            margin-top: 10px;
            color: #5d7087;
            font-size: .8rem;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div>
              <div class="kicker">Relatorio mensal de pagamentos</div>
              <h1>${esc(monthTitle)}</h1>
              <div class="meta">Gerado em ${esc(generatedAt)}</div>
            </div>
            <div class="meta">Clientes diferentes: ${esc(String(clientCount))}</div>
          </div>
          <div class="stats">
            <div class="stat"><span>Total do mes</span><strong>${esc(money(totalAmount))}</strong></div>
            <div class="stat"><span>Pagamentos</span><strong>${esc(String(paymentCount))}</strong></div>
            <div class="stat"><span>Pagos</span><strong>${esc(String(paidCountValue))}</strong></div>
            <div class="stat"><span>Falta pagar</span><strong>${esc(String(pendingCountValue))}</strong></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Metodo</th>
                  <th>Referencia</th>
                  <th>Montante</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          <div class="footer">Clientes diferentes neste mes: ${esc(String(clientCount))} | Registos carregados: ${esc(String(paymentCount))}</div>
        </div>
      </body>
      </html>`;

    document.body.appendChild(iframe);
    iframe.addEventListener("load", () => {
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      if (!win || !doc) {
        cleanupIframe();
        show("Nao foi possivel preparar a impressao.", false);
        return;
      }

      const runPrint = async () => {
        try {
          if (doc.fonts && doc.fonts.ready) {
            await doc.fonts.ready.catch(() => {});
          }

          setTimeout(() => {
            try {
              win.focus();
              win.onafterprint = cleanupIframe;
              win.print();
              setTimeout(cleanupIframe, 4000);
            } catch (_error) {
              cleanupIframe();
              show("Nao foi possivel preparar a impressao.", false);
            }
          }, 200);
        } catch (_error) {
          cleanupIframe();
          show("Nao foi possivel preparar a impressao.", false);
        }
      };

      runPrint();
    }, { once: true });

    iframe.srcdoc = html;
    return;

    const existingRoot = document.getElementById("monthlyReportPrintRoot");
    if (existingRoot) {
      existingRoot.remove();
    }

    const style = document.createElement("style");
    style.id = "monthlyReportPrintStyle";
    style.textContent = `
      body.monthly-report-printing {
        overflow: hidden !important;
      }
      body.monthly-report-printing > *:not(#monthlyReportPrintRoot) {
        display: none !important;
      }
      #monthlyReportPrintRoot {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: #fff;
        overflow: auto;
        padding: 16px;
      }
      @media print {
        body.monthly-report-printing > *:not(#monthlyReportPrintRoot) {
          display: none !important;
        }
        #monthlyReportPrintRoot {
          position: static !important;
          inset: auto !important;
          z-index: auto !important;
          background: #fff !important;
          overflow: visible !important;
          padding: 0 !important;
        }
        #monthlyReportPrintRoot .report-modal-actions,
        #monthlyReportPrintRoot .report-modal-backdrop {
          display: none !important;
        }
        #monthlyReportPrintRoot .report-modal-panel {
          width: 100% !important;
          max-height: none !important;
          overflow: visible !important;
          box-shadow: none !important;
          border: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
        }
      }
    `;

    const printRoot = document.createElement("div");
    printRoot.id = "monthlyReportPrintRoot";
    printRoot.innerHTML = `
      <section class="report-modal-panel" role="document" aria-labelledby="monthlyReportPrintTitle">
        <div class="report-modal-head">
          <div>
            <div class="muted">Relatório mensal de pagamentos</div>
            <h3 id="monthlyReportPrintTitle">${esc(monthTitle)}</h3>
            <div class="muted">Gerado em ${esc(generatedAt)}</div>
          </div>
          <div class="muted">Clientes diferentes: ${esc(String(clientCount))}</div>
        </div>
        <div class="report-stats">
          <article class="report-stat"><span>Total do mês</span><strong>${esc(money(totalAmount))}</strong></article>
          <article class="report-stat"><span>Pagamentos</span><strong>${esc(String(paymentCount))}</strong></article>
          <article class="report-stat"><span>Pagos</span><strong>${esc(String(paidCountValue))}</strong></article>
          <article class="report-stat"><span>Falta pagar</span><strong>${esc(String(pendingCountValue))}</strong></article>
        </div>
        <div class="report-table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Método</th>
                <th>Referência</th>
                <th>Montante</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="report-footer muted">Clientes diferentes neste mês: ${esc(String(clientCount))} | Registos carregados: ${esc(String(paymentCount))}</div>
      </section>
    `;

    const cleanup = () => {
      document.body.classList.remove("monthly-report-printing");
      document.body.style.overflow = "";
      if (printRoot.parentNode) printRoot.parentNode.removeChild(printRoot);
      if (style.parentNode) style.parentNode.removeChild(style);
    };

    document.head.appendChild(style);
    document.body.appendChild(printRoot);
    document.body.classList.add("monthly-report-printing");
    document.body.style.overflow = "hidden";

    const doPrint = () => {
      try {
        window.print();
      } catch (_error) {
        cleanup();
        show("Nao foi possivel preparar a impressao.", false);
      }
    };

    window.addEventListener("afterprint", cleanup, { once: true });
    setTimeout(doPrint, 150);
    setTimeout(cleanup, 5000);
  }

  function renderAll() {
    const orderMap = buildOrderMap();
    buildOrderSelect();
    buildMonthFilter();
    buildClientFilter(orderMap);
    const filtered = applyFilters(orderMap);
    renderTotals(filtered, orderMap);
    renderRows(filtered, orderMap);
  }

  function printMonthlyReportIframe() {
    if (!monthlyReportPrintData) {
      show("Abre primeiro o relatorio antes de imprimir.", false);
      return;
    }

    const {
      monthTitle,
      generatedAt,
      clientCount,
      totalAmount,
      paidCountValue,
      pendingCountValue,
      paymentCount,
      rowsHtml
    } = monthlyReportPrintData;

    const existingFrame = document.getElementById("monthlyReportPrintFrame");
    if (existingFrame) {
      existingFrame.remove();
    }

    const iframe = document.createElement("iframe");
    iframe.id = "monthlyReportPrintFrame";
    iframe.title = "Relatorio mensal";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.inset = "0";
    iframe.style.width = "100vw";
    iframe.style.height = "100vh";
    iframe.style.border = "0";
    iframe.style.opacity = "1";
    iframe.style.background = "#fff";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "9999";

    const cleanup = () => {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch (_error) {
        // ignore
      }
    };

    const html = `<!doctype html>
      <html lang="pt-PT">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Relatorio mensal | ${esc(monthTitle)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body {
            margin: 0;
            font-family: "Segoe UI", Tahoma, sans-serif;
            color: #10233b;
            background: #fff;
          }
          .page { padding: 0; }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            padding-bottom: 12px;
            border-bottom: 2px solid #d7e4f1;
          }
          .kicker { color: #5d7087; font-size: .9rem; }
          h1 { margin: 4px 0 6px; font-size: 1.55rem; }
          .meta { color: #5d7087; font-size: .82rem; }
          .stats {
            margin-top: 14px;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
          }
          .stat {
            border: 1px solid #d7e4f1;
            border-radius: 12px;
            background: #fff;
            padding: 10px 12px;
          }
          .stat span {
            display: block;
            font-size: .76rem;
            color: #5d7087;
            margin-bottom: 5px;
          }
          .stat strong { font-size: 1.15rem; }
          .table-wrap {
            margin-top: 14px;
            border: 1px solid #d7e4f1;
            border-radius: 12px;
            overflow: hidden;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10.5px;
          }
          th, td {
            padding: 8px 10px;
            text-align: left;
            border-bottom: 1px solid #e4edf6;
            vertical-align: top;
          }
          th {
            background: #86c74f;
            color: #103116;
          }
          tbody tr:nth-child(even) { background: #fafcff; }
          .footer {
            margin-top: 10px;
            color: #5d7087;
            font-size: .8rem;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div>
              <div class="kicker">Relatorio mensal de pagamentos</div>
              <h1>${esc(monthTitle)}</h1>
              <div class="meta">Gerado em ${esc(generatedAt)}</div>
            </div>
            <div class="meta">Clientes diferentes: ${esc(String(clientCount))}</div>
          </div>
          <div class="stats">
            <div class="stat"><span>Total do mes</span><strong>${esc(money(totalAmount))}</strong></div>
            <div class="stat"><span>Pagamentos</span><strong>${esc(String(paymentCount))}</strong></div>
            <div class="stat"><span>Pagos</span><strong>${esc(String(paidCountValue))}</strong></div>
            <div class="stat"><span>Falta pagar</span><strong>${esc(String(pendingCountValue))}</strong></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Metodo</th>
                  <th>Referencia</th>
                  <th>Montante</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          <div class="footer">Clientes diferentes neste mes: ${esc(String(clientCount))} | Registos carregados: ${esc(String(paymentCount))}</div>
        </div>
      </body>
      </html>`;

    document.body.appendChild(iframe);
    iframe.addEventListener("load", () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          show("Nao foi possivel preparar a impressao.", false);
          return;
        }

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
      cleanup();
    }, 120000);
  }

  function openMonthlyReport() {
    const orderMap = buildOrderMap();
    const selectedMonth = filters.month || currentMonthValue();
    const monthPayments = payments.filter((payment) => monthValue(payment.paid_at || payment.created_at) === selectedMonth);
    const monthOrders = monthPayments.map((payment) => orderMap[payment.order_id]).filter(Boolean);

    const totalAmount = monthPayments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0);
    const paidCountValue = monthPayments.filter((payment) => {
      const order = orderMap[payment.order_id];
      return order && String(order.status || "").toLowerCase() === "paid";
    }).length;
    const pendingCountValue = Math.max(monthPayments.length - paidCountValue, 0);
    const monthTitle = monthLabel(selectedMonth);
    const generatedAt = new Date().toLocaleString("pt-PT");
    const clientCount = new Set(monthOrders.map((order) => order && order.client_id).filter(Boolean)).size;

    if (!monthlyReportModal || !monthlyReportTitle || !monthlyReportMeta || !monthlyReportStats || !monthlyReportBody || !monthlyReportFooter) {
      show("Nao foi possivel abrir o relatorio.", false);
      return;
    }

    monthlyReportTitle.textContent = monthTitle;
    monthlyReportMeta.textContent = `Gerado em ${generatedAt}`;
    monthlyReportStats.innerHTML = [
      { label: "Total do mes", value: money(totalAmount) },
      { label: "Pagamentos", value: String(monthPayments.length) },
      { label: "Pagos", value: String(paidCountValue) },
      { label: "Falta pagar", value: String(pendingCountValue) }
    ].map((item) => `
      <article class="report-stat">
        <span>${esc(item.label)}</span>
        <strong>${esc(item.value)}</strong>
      </article>
    `).join("");
    monthlyReportBody.innerHTML = monthPayments.length
      ? monthPayments.map((payment) => {
          const order = orderMap[payment.order_id];
          const paidAt = payment.paid_at || payment.created_at;
          const status = order && String(order.status || "").toLowerCase() === "paid" ? "Pago" : "Pendente";
          return `
            <tr>
              <td>${paidAt ? new Date(paidAt).toLocaleDateString("pt-PT") : "-"}</td>
              <td>${esc(order ? order.client_name : "-")}</td>
              <td>${esc(humanMethod(payment.method))}</td>
              <td>${esc(payment.reference || "-")}</td>
              <td>${money(payment.amount)}</td>
              <td>${status}</td>
            </tr>
          `;
        }).join("")
      : "<tr><td colspan='6'>Sem registos para este mes.</td></tr>";
    monthlyReportFooter.textContent = `Clientes diferentes neste mes: ${String(clientCount)} | Registos carregados: ${String(monthPayments.length)}`;
    monthlyReportModal.hidden = false;
    document.body.style.overflow = "hidden";
    monthlyReportModal.scrollTop = 0;
    monthlyReportPrintData = {
      monthTitle,
      generatedAt,
      clientCount,
      totalAmount,
      paidCountValue,
      pendingCountValue,
      paymentCount: monthPayments.length,
      rowsHtml: monthPayments.length
        ? monthPayments.map((payment) => {
            const order = orderMap[payment.order_id];
            const paidAt = payment.paid_at || payment.created_at;
            const status = order && String(order.status || "").toLowerCase() === "paid" ? "Pago" : "Pendente";
            return `
              <tr>
                <td>${paidAt ? new Date(paidAt).toLocaleDateString("pt-PT") : "-"}</td>
                <td>${esc(order ? order.client_name : "-")}</td>
                <td>${esc(humanMethod(payment.method))}</td>
                <td>${esc(payment.reference || "-")}</td>
                <td>${money(payment.amount)}</td>
                <td>${status}</td>
              </tr>
            `;
          }).join("")
        : "<tr><td colspan='6'>Sem registos para este mes.</td></tr>"
    };
    return;

    const rowsHtml = monthPayments.length
      ? monthPayments.map((payment) => {
          const order = orderMap[payment.order_id];
          const paidAt = payment.paid_at || payment.created_at;
          const status = order && String(order.status || "").toLowerCase() === "paid" ? "Pago" : "Pendente";
          return `
            <tr>
              <td>${paidAt ? new Date(paidAt).toLocaleDateString("pt-PT") : "-"}</td>
              <td>${esc(order ? order.client_name : "-")}</td>
              <td>${esc(humanMethod(payment.method))}</td>
              <td>${esc(payment.reference || "-")}</td>
              <td>${money(payment.amount)}</td>
              <td>${status}</td>
            </tr>
          `;
        }).join("")
      : "<tr><td colspan='6'>Sem registos para este mes.</td></tr>";

    const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
    if (!reportWindow) {
      show("Nao foi possivel abrir o relatorio. Verifica se o browser bloqueou o popup.", false);
      return;
    }

    reportWindow.document.open();
    reportWindow.document.write(`<!doctype html>
      <html lang="pt-PT">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Relatório mensal | ${esc(monthTitle)}</title>
        <style>
          :root {
            --ink: #10233b;
            --muted: #5d7087;
            --brand: #154c79;
            --line: #d7e2ee;
            --bg: #f5f8fc;
            --panel: #ffffff;
            --soft: #eef4fb;
            --accent: #86c74f;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Segoe UI", Tahoma, sans-serif;
            color: var(--ink);
            background: linear-gradient(180deg, #f7fbff 0%, #f2f7fd 100%);
          }
          .page {
            max-width: 1100px;
            margin: 0 auto;
            padding: 24px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 18px;
            box-shadow: 0 10px 22px rgba(14, 41, 69, .06);
          }
          .header h1 {
            margin: 0 0 4px;
            font-size: 1.6rem;
          }
          .muted { color: var(--muted); }
          .actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          button {
            border: 0;
            border-radius: 10px;
            padding: 10px 14px;
            cursor: pointer;
            font-weight: 700;
            background: var(--brand);
            color: #fff;
          }
          button.secondary {
            background: #e7f0fb;
            color: var(--brand);
            border: 1px solid #cbdced;
          }
          .stats {
            margin-top: 14px;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
          }
          .stat {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 14px;
            padding: 14px;
            box-shadow: 0 8px 18px rgba(14, 41, 69, .05);
          }
          .stat span {
            display: block;
            font-size: .8rem;
            color: var(--muted);
            margin-bottom: 6px;
          }
          .stat strong {
            font-size: 1.3rem;
          }
          .table-wrap {
            margin-top: 14px;
            overflow: auto;
            border: 1px solid var(--line);
            border-radius: 14px;
            background: var(--panel);
            box-shadow: 0 8px 18px rgba(14, 41, 69, .05);
          }
          table {
            width: 100%;
            min-width: 900px;
            border-collapse: collapse;
          }
          th, td {
            text-align: left;
            padding: 10px 12px;
            border-bottom: 1px solid var(--line);
            font-size: .92rem;
          }
          th {
            background: var(--accent);
            color: #103116;
          }
          tbody tr:nth-child(even) { background: #fafcff; }
          .footer {
            margin-top: 12px;
            font-size: .84rem;
            color: var(--muted);
          }
          @media print {
            body { background: #fff; }
            .page { padding: 0; max-width: none; }
            .actions { display: none; }
            .header, .stat, .table-wrap { box-shadow: none; }
          }
          @media (max-width: 900px) {
            .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .header { flex-direction: column; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div>
              <div class="muted">Relatório mensal de pagamentos</div>
              <h1>${esc(monthTitle)}</h1>
              <div class="muted">Gerado em ${esc(generatedAt)}</div>
            </div>
            <div class="actions">
              <button class="secondary" type="button" onclick="window.print()">Imprimir</button>
              <button type="button" onclick="window.close()">Fechar</button>
            </div>
          </div>
          <div class="stats">
            <div class="stat"><span>Total do mês</span><strong>${money(totalAmount)}</strong></div>
            <div class="stat"><span>Pagamentos</span><strong>${String(monthPayments.length)}</strong></div>
            <div class="stat"><span>Pagos</span><strong>${String(paidCountValue)}</strong></div>
            <div class="stat"><span>Falta pagar</span><strong>${String(pendingCountValue)}</strong></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Metodo</th>
                  <th>Referencia</th>
                  <th>Montante</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          <div class="footer">
            Clientes diferentes neste mês: ${String(clientCount)} | Registos carregados: ${String(monthPayments.length)}
          </div>
        </div>
      </body>
      </html>`);
    reportWindow.document.close();
  }

  async function loadAllData() {
    const [paymentsResponse, ordersResponse] = await Promise.all([
      window.CRMApi.getPayments({ page: 1, pageSize: 500 }),
      window.CRMApi.getOrders({ page: 1, pageSize: 500 })
    ]);

    payments = paymentsResponse.items || [];
    orders = ordersResponse.items || [];
  }

  async function createPayment(event) {
    event.preventDefault();

    const orderId = String(document.getElementById("paymentOrderId").value || "");
    const month = String(paymentMonthInput.value || "").slice(0, 7);
    const amount = Number(String(document.getElementById("paymentAmount").value || "0").replace(",", "."));
    const method = String(document.getElementById("paymentMethod").value || "");
    const reference = String(document.getElementById("paymentReference").value || "").trim();

    if (!orderId || !month || !Number.isFinite(amount) || amount <= 0 || !method) {
      show("Ordem, mes, montante e metodo sao obrigatorios.", false);
      return;
    }

    try {
      const wasEditing = Boolean(editingPaymentId);
      const payload = {
        orderId,
        amount,
        method,
        reference: reference || undefined,
        paidAt: paidAtForMonth(month)
      };

      if (editingPaymentId) {
        await window.CRMApi.updatePayment(editingPaymentId, payload);
      } else {
        await window.CRMApi.createPayment(payload);
      }

      filters.month = month;
      resetPaymentFormState();
      await loadAllData();
      renderAll();
      show(wasEditing ? "Pagamento corrigido com sucesso." : "Pagamento registado com sucesso.", true);
      notifyDashboardChange();
    } catch (error) {
      show(error && error.message ? error.message : "Falha ao registar pagamento.", false);
    }
  }

  async function bootstrap() {
    const session = await window.CRMAuth.ensureAuth();
    if (!session) return;

    window.CRMAuth.bindLogout();

    paymentMonthInput.value = currentMonthValue();
    paymentForm.addEventListener("submit", createPayment);

    cancelPaymentEditBtn.addEventListener("click", () => {
      resetPaymentFormState();
      show("Edicao cancelada.", true);
    });

    paymentsClientFilter.addEventListener("change", () => {
      filters.client = paymentsClientFilter.value;
      renderAll();
    });

    paymentsMonthFilter.addEventListener("change", () => {
      filters.month = paymentsMonthFilter.value;
      renderAll();
    });

    paymentsStatusFilter.addEventListener("change", () => {
      filters.status = paymentsStatusFilter.value;
      renderAll();
    });

    addPaymentRowBtn.addEventListener("click", () => {
      if (editingPaymentId) {
        resetPaymentFormState();
      }
      document.getElementById("paymentOrderId").focus();
    });

    if (monthlyReportBtn) {
      monthlyReportBtn.addEventListener("click", openMonthlyReport);
    }

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

    paymentsBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const paymentId = String(button.dataset.paymentId || "");
      const payment = payments.find((item) => item.id === paymentId);
      if (!payment) {
        show("Pagamento nao encontrado.", false);
        return;
      }
      if (button.dataset.action === "edit") {
        startEditingPayment(payment);
        return;
      }

      if (button.dataset.action === "delete") {
        if (!confirm("Confirmas a eliminacao deste pagamento?")) return;
        window.CRMApi.deletePayment(paymentId)
          .then(async () => {
            if (editingPaymentId === paymentId) {
              resetPaymentFormState();
            }
            await loadAllData();
            renderAll();
            show("Pagamento eliminado com sucesso.", true);
            notifyDashboardChange();
          })
          .catch((error) => {
            show(error && error.message ? error.message : "Falha ao eliminar pagamento.", false);
          });
      }
    });

    if (savePaymentsBtn) {
      savePaymentsBtn.addEventListener("click", async () => {
        await loadAllData();
        renderAll();
        show("Dados sincronizados com a API.", true);
        notifyDashboardChange();
      });
    }

    clearPaymentsBtn.addEventListener("click", () => {
      show("Limpeza total nao disponivel por seguranca na API.", false);
    });

    try {
      await loadAllData();
      renderAll();
    } catch (error) {
      show(error && error.message ? error.message : "Falha ao carregar pagamentos.", false);
    }
  }

  bootstrap();
})();
