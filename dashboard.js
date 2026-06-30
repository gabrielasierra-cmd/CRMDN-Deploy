(function () {
  const CURRENCY = "EUR";
  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const els = {
    feedback: document.getElementById("mainFeedback"),
    refreshBtn: document.getElementById("refreshBtn"),
    profitChart: document.getElementById("profitChart"),
    profitEmpty: document.getElementById("profitEmpty"),
    profitHint: document.getElementById("profitHint"),
    profitYearInfo: document.getElementById("profitYearInfo"),
    metrics: document.getElementById("dashboardMetrics"),
    pendingList: document.getElementById("pendingList"),
    pendingSummary: document.getElementById("pendingSummary"),
    sessionInfo: document.getElementById("sessionInfo"),
    userEmail: document.getElementById("userEmail")
  };

  const state = {
    dashboardSummary: null,
    payments: [],
    expenses: [],
    orders: [],
    salaries: [],
    employees: [],
    chartView: "all",
    year: new Date().getFullYear(),
    balanceInitial: 0,
    warnings: [],
    loadedAt: null
  };

  let refreshTimer = null;

  function money(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: CURRENCY }).format(Number.isFinite(number) ? number : 0);
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function parseNumber(raw) {
    const n = Number(String(raw || "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeDateValue(value) {
    const text = String(value || "");
    if (!text) return new Date();
    if (/^\d{4}-\d{2}$/.test(text)) {
      const [year, month] = text.split("-").map(Number);
      return new Date(year, month - 1, 1);
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      const [year, month, day] = text.slice(0, 10).split("-").map(Number);
      return new Date(year, month - 1, day);
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  function monthKeyFromDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function monthLabel(monthKey) {
    const year = Number(String(monthKey || "").slice(0, 4));
    const month = Number(String(monthKey || "").slice(5, 7));
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return monthKey || "-";
    }
    return new Date(year, month - 1, 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  }

  function toTitleCase(value) {
    return String(value || "")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .trim();
  }

  function normalizeSalaryRow(row) {
    const month = String(row.month || row.periodMonth || row.period_month || "").slice(0, 7);
    return {
      id: String(row.id || CRM.uid()),
      month,
      employeeId: String(row.employeeId || row.employee_id || ""),
      employee: String(row.employee || row.employeeName || row.employee_name || "").trim(),
      baseSalary: parseNumber(row.baseSalary ?? row.baseAmount ?? row.base_amount ?? 0),
      extras: parseNumber(row.extras ?? row.bonusAmount ?? row.bonus_amount ?? 0),
      deductions: parseNumber(row.deductions ?? row.discountAmount ?? row.discount_amount ?? 0),
      paidAt: String(row.paidAt || row.paid_at || row.createdAt || row.created_at || "").slice(0, 10),
      status: row.status === "pago" ? "pago" : "pendente",
      notes: String(row.notes || row.note || "").trim(),
      netAmount: parseNumber(row.netAmount ?? row.net_amount ?? 0)
    };
  }

  function salaryRowTotal(row) {
    if (Number.isFinite(Number(row.netAmount))) {
      return parseNumber(row.netAmount);
    }
    return +(parseNumber(row.baseSalary) + parseNumber(row.extras) - parseNumber(row.deductions)).toFixed(2);
  }

  function getTotalPagamentos() {
    return state.payments.reduce((acc, payment) => acc + parseNumber(payment.amount), 0);
  }

  function getTotalFuncionarios() {
    return state.salaries.reduce((acc, row) => acc + salaryRowTotal(row), 0);
  }

  function getTotalGastos() {
    return state.expenses.reduce((acc, expense) => acc + parseNumber(expense.amount), 0);
  }

  function getGanho() {
    return getTotalPagamentos() - getTotalFuncionarios() - getTotalGastos();
  }

  function getSaldoEmConta() {
    return state.balanceInitial + getGanho();
  }

  function getPaymentCount() {
    return state.payments.length;
  }

  function getExpenseCount() {
    return state.expenses.length;
  }

  function getEmployeeCount() {
    return state.employees.length;
  }

  function getPendingPayments() {
    const orderMap = Object.fromEntries(state.orders.map((order) => [order.id, order]));
    return state.orders
      .filter((order) => String(order.status || "").toLowerCase() !== "paid")
      .map((order) => ({
        id: order.id,
        label: order.client_name || order.clientName || "-",
        secondary: order.service_name || order.serviceName || "-",
        value: parseNumber(order.total_amount || order.totalAmount),
        when: order.scheduled_at || order.scheduledAt || order.created_at || order.createdAt || "",
        badge: "Por pagar"
      }))
      .sort((a, b) => normalizeDateValue(a.when) - normalizeDateValue(b.when))
      .slice(0, 6);
  }

  function getPendingSalaryRows() {
    const latestMonth = state.salaries
      .map((row) => String(row.month || "").slice(0, 7))
      .filter((value) => /^\d{4}-\d{2}$/.test(value))
      .sort()
      .slice(-1)[0] || "";

    const monthSalaryEmployeeIds = new Set(
      state.salaries
        .filter((row) => String(row.month || "").slice(0, 7) === latestMonth)
        .map((row) => String(row.employeeId || ""))
        .filter(Boolean)
    );

    return state.employees
      .filter((employee) => !monthSalaryEmployeeIds.has(String(employee.id || "")))
      .map((row) => ({
        id: row.id,
        label: row.full_name || row.name || "-",
        secondary: latestMonth ? `Sem registo em ${monthLabel(latestMonth)}` : "Sem registo salarial",
        value: parseNumber(row.salary_base),
        when: latestMonth ? `${latestMonth}-01` : "",
        badge: "Em falta"
      }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), "pt"))
      .slice(0, 6);
  }

  function getLatestYear() {
    const years = [];

    state.payments.forEach((payment) => {
      const year = normalizeDateValue(payment.paid_at || payment.paidAt || payment.created_at || payment.createdAt).getFullYear();
      if (Number.isFinite(year)) years.push(year);
    });

    state.expenses.forEach((expense) => {
      const year = normalizeDateValue(expense.expense_date || expense.expenseDate || expense.created_at || expense.createdAt).getFullYear();
      if (Number.isFinite(year)) years.push(year);
    });

    state.salaries.forEach((row) => {
      const year = Number(String(row.month || "").slice(0, 4));
      if (Number.isFinite(year)) years.push(year);
    });

    if (!years.length) return new Date().getFullYear();
    return Math.max(...years);
  }

  function buildMonthlySeries(year) {
    const paymentsByMonth = new Array(12).fill(0);
    const expensesByMonth = new Array(12).fill(0);
    const salariesByMonth = new Array(12).fill(0);

    state.payments.forEach((payment) => {
      const date = normalizeDateValue(payment.paid_at || payment.paidAt || payment.created_at || payment.createdAt);
      if (date.getFullYear() !== year) return;
      paymentsByMonth[date.getMonth()] += parseNumber(payment.amount);
    });

    state.expenses.forEach((expense) => {
      const date = normalizeDateValue(expense.expense_date || expense.expenseDate || expense.created_at || expense.createdAt);
      if (date.getFullYear() !== year) return;
      expensesByMonth[date.getMonth()] += parseNumber(expense.amount);
    });

    state.salaries.forEach((row) => {
      const month = String(row.month || "");
      const rowYear = Number(month.slice(0, 4));
      const rowMonth = Number(month.slice(5, 7));
      if (!Number.isFinite(rowYear) || rowYear !== year) return;
      if (!Number.isFinite(rowMonth) || rowMonth < 1 || rowMonth > 12) return;
      salariesByMonth[rowMonth - 1] += salaryRowTotal(row);
    });

    const resultByMonth = paymentsByMonth.map((value, index) => +(value - expensesByMonth[index] - salariesByMonth[index]).toFixed(2));

    return { paymentsByMonth, expensesByMonth, salariesByMonth, resultByMonth };
  }

  function iconSvg(kind) {
    const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if (kind === "payments") {
      return `<svg ${common}><path d="M5 7h14v10H5z"></path><path d="M8 10h8"></path><path d="M12 14V4"></path></svg>`;
    }
    if (kind === "employees") {
      return `<svg ${common}><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"></path><path d="M4 20c1.8-3.4 4.7-5 8-5s6.2 1.6 8 5"></path></svg>`;
    }
    if (kind === "expenses") {
      return `<svg ${common}><path d="M4 7h16v10H4z"></path><path d="M8 12h8"></path><path d="M7 4h10"></path></svg>`;
    }
    if (kind === "gain") {
      return `<svg ${common}><path d="M4 16l5-5 4 4 7-7"></path><path d="M16 8h4v4"></path></svg>`;
    }
    return `<svg ${common}><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>`;
  }

  function setFeedback(message, isWarning) {
    if (!els.feedback) return;
    if (!message) {
      els.feedback.hidden = true;
      els.feedback.classList.remove("is-warn");
      return;
    }

    els.feedback.hidden = false;
    els.feedback.classList.toggle("is-warn", Boolean(isWarning));
    els.feedback.textContent = message;
  }

  function renderMetrics() {
    if (!els.metrics) return;

    const summary = state.dashboardSummary || {};
    const totalPayments = Number.isFinite(Number(summary.totalFaturado)) ? Number(summary.totalFaturado) : getTotalPagamentos();
    const totalEmployees = Number.isFinite(Number(summary.totalSalarios)) ? Number(summary.totalSalarios) : getTotalFuncionarios();
    const totalExpenses = Number.isFinite(Number(summary.totalDespesas)) ? Number(summary.totalDespesas) : getTotalGastos();
    const gain =
      Number.isFinite(Number(summary.totalFaturado)) &&
      Number.isFinite(Number(summary.totalSalarios)) &&
      Number.isFinite(Number(summary.totalDespesas))
        ? Number(summary.totalFaturado) - Number(summary.totalSalarios) - Number(summary.totalDespesas)
        : getGanho();
    const balance = getSaldoEmConta();

    const cards = [
      {
        label: "Pagamentos",
        value: money(totalPayments),
        note: `${getPaymentCount()} registos`,
        tone: "positive",
        icon: "payments"
      },
      {
        label: "Funcionários",
        value: money(totalEmployees),
        note: `${getEmployeeCount()} colaboradores`,
        tone: "neutral",
        icon: "employees"
      },
      {
        label: "Gastos",
        value: money(totalExpenses),
        note: `${getExpenseCount()} registos`,
        tone: "neutral",
        icon: "expenses"
      },
      {
        label: "Ganho",
        value: money(gain),
        note: gain >= 0 ? "Resultado positivo" : "Resultado negativo",
        tone: gain >= 0 ? "positive" : "critical",
        icon: "gain"
      },
      {
        label: "Saldo em conta",
        value: money(balance),
        note: `Saldo inicial: ${money(state.balanceInitial)}`,
        tone: balance >= 0 ? "positive" : "critical",
        icon: "wallet"
      }
    ];

    els.metrics.innerHTML = cards.map((card) => `
      <article class="dashboard-metric dashboard-metric-${card.tone}">
        <div class="dashboard-metric-head">
          <div>
            <span class="dashboard-metric-label">${esc(card.label)}</span>
            <strong class="dashboard-metric-value">${esc(card.value)}</strong>
          </div>
          <div class="dashboard-metric-icon">${iconSvg(card.icon)}</div>
        </div>
        <div class="dashboard-metric-note">${esc(card.note)}</div>
      </article>
    `).join("");
  }

  function renderChart() {
    if (!els.profitChart || !els.profitEmpty) return;

    const hasData = state.payments.length || state.expenses.length || state.salaries.length;
    const year = getLatestYear();
    state.year = year;
    if (els.profitYearInfo) {
      els.profitYearInfo.textContent = `Ano ${year}`;
    }

    if (!hasData) {
      els.profitChart.innerHTML = "";
      els.profitEmpty.hidden = false;
      els.profitEmpty.style.display = "grid";
      if (els.profitHint) {
        els.profitHint.textContent = "Sem dados para exibir.";
      }
      return;
    }

    const series = buildMonthlySeries(year);
    const view = state.chartView;

    const sourceValues = view === "payments"
      ? series.paymentsByMonth
      : view === "expenses"
        ? series.expensesByMonth
        : view === "net"
          ? series.resultByMonth.map((value) => Math.abs(value))
          : [
              ...series.paymentsByMonth,
              ...series.expensesByMonth,
              ...series.resultByMonth.map((value) => Math.abs(value))
            ];

    const maxValue = Math.max(1, ...sourceValues.map((value) => Math.abs(parseNumber(value))));
    const barHeight = (value) => Math.max(4, Math.round((Math.abs(parseNumber(value)) / maxValue) * 180));
    const hasAnyNonZero = sourceValues.some((value) => Math.abs(parseNumber(value)) > 0);

    els.profitEmpty.hidden = hasAnyNonZero;
    els.profitEmpty.style.display = hasAnyNonZero ? "none" : "grid";
    els.profitEmpty.setAttribute("aria-hidden", hasAnyNonZero ? "true" : "false");
    if (els.profitHint) {
      els.profitHint.textContent = state.chartView === "all"
        ? "Passe o rato por cima das barras para ver pagamentos, gastos e resultado."
        : `Filtro atual: ${toTitleCase(state.chartView === "net" ? "resultado" : state.chartView)}`;
    }

    const monthMarkup = MONTHS.map((label, index) => {
      const paymentsValue = series.paymentsByMonth[index];
      const expensesValue = series.expensesByMonth[index];
      const resultValue = series.resultByMonth[index];

      let bars = "";
      let barsClass = "dashboard-bars";

      if (view === "payments") {
        barsClass += " single";
        bars = `<div class="dashboard-bar payments" style="height:${barHeight(paymentsValue)}px" data-title="${label} ${year} | Pagamentos: ${money(paymentsValue)}"></div>`;
      } else if (view === "expenses") {
        barsClass += " single";
        bars = `<div class="dashboard-bar expenses" style="height:${barHeight(expensesValue)}px" data-title="${label} ${year} | Gastos: ${money(expensesValue)}"></div>`;
      } else if (view === "net") {
        barsClass += " single";
        const tone = resultValue >= 0 ? "positive" : "negative";
        bars = `<div class="dashboard-bar result ${tone}" style="height:${barHeight(resultValue)}px" data-title="${label} ${year} | Resultado: ${money(resultValue)}"></div>`;
      } else {
        bars = `
          <div class="dashboard-bar payments" style="height:${barHeight(paymentsValue)}px" data-title="${label} ${year} | Pagamentos: ${money(paymentsValue)}"></div>
          <div class="dashboard-bar expenses" style="height:${barHeight(expensesValue)}px" data-title="${label} ${year} | Gastos: ${money(expensesValue)}"></div>
          <div class="dashboard-bar result ${resultValue >= 0 ? "positive" : "negative"}" style="height:${barHeight(resultValue)}px" data-title="${label} ${year} | Resultado: ${money(resultValue)}"></div>
        `;
      }

      return `
        <div class="dashboard-month">
          <div class="${barsClass}">${bars}</div>
          <div class="dashboard-month-label">${label}</div>
        </div>
      `;
    }).join("");

    els.profitChart.innerHTML = monthMarkup;
    els.profitChart.querySelectorAll(".dashboard-bar").forEach((bar) => {
      bar.addEventListener("mouseenter", () => {
        if (els.profitHint) els.profitHint.textContent = bar.dataset.title || "";
      });
      bar.addEventListener("mouseleave", () => {
        if (els.profitHint) {
          els.profitHint.textContent = state.chartView === "all"
            ? "Passe o rato por cima das barras para ver pagamentos, gastos e resultado."
            : `Filtro atual: ${toTitleCase(state.chartView === "net" ? "resultado" : state.chartView)}`;
        }
      });
    });
  }

  function renderPending() {
    if (!els.pendingList) return;

    const pendingPayments = getPendingPayments();
    const pendingSalaries = getPendingSalaryRows();
    const pendingPaymentsValue = pendingPayments.reduce((acc, item) => acc + parseNumber(item.value), 0);
    const pendingSalariesValue = pendingSalaries.reduce((acc, item) => acc + parseNumber(item.value), 0);

    if (els.pendingSummary) {
      els.pendingSummary.innerHTML = `
        <span>${pendingPayments.length} pagamentos pendentes</span>
        <span>${pendingSalaries.length} salários pendentes</span>
      `;
    }

    const renderItems = (items, emptyLabel) => {
      if (!items.length) return `<div class="dashboard-pending-empty">${esc(emptyLabel)}</div>`;
      return items.map((item) => `
        <div class="dashboard-pending-row">
          <div class="dashboard-pending-row-main">
            <strong>${esc(item.label)}</strong>
            <span>${esc(item.secondary)}</span>
          </div>
          <div class="dashboard-pending-row-side">
            <span class="dashboard-pending-pill">${esc(item.badge)}</span>
            <strong>${esc(money(item.value))}</strong>
          </div>
        </div>
      `).join("");
    };

    els.pendingList.innerHTML = `
      <article class="dashboard-pending-panel dashboard-pending-panel-simple">
        <div class="dashboard-pending-panel-head">
          <div>
            <h3>Pagamentos por regularizar</h3>
            <div class="muted">${pendingPayments.length} itens</div>
          </div>
          <div class="dashboard-pending-total">${money(pendingPaymentsValue)}</div>
        </div>
        <div class="dashboard-pending-items dashboard-pending-items-clean">
          ${renderItems(pendingPayments, "Sem pagamentos pendentes.")}
        </div>
      </article>
      <article class="dashboard-pending-panel dashboard-pending-panel-simple">
        <div class="dashboard-pending-panel-head">
          <div>
            <h3>Funcionários por pagar</h3>
            <div class="muted">${pendingSalaries.length} itens</div>
          </div>
          <div class="dashboard-pending-total">${money(pendingSalariesValue)}</div>
        </div>
        <div class="dashboard-pending-items dashboard-pending-items-clean">
          ${renderItems(pendingSalaries, "Sem salários pendentes.")}
        </div>
      </article>
    `;
  }

  function renderSessionInfo(session) {
    const userLabel = session && session.user ? (session.user.name || session.user.email || session.role || "") : "";
    if (els.sessionInfo) {
      els.sessionInfo.textContent = userLabel ? `Sessão ativa: ${userLabel}` : "";
    }
    if (els.userEmail) {
      els.userEmail.textContent = session && session.user && session.user.email ? session.user.email : "-";
    }
  }

  function renderAll() {
    renderMetrics();
    renderChart();
    renderPending();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      updateDashboard().catch((error) => {
        setFeedback(error && error.message ? error.message : "Falha ao atualizar o dashboard.", true);
      });
    }, 80);
  }

  async function loadData() {
    const pageSize = 500;
    const fetchAll = async (getter) => {
      const collected = [];
      let page = 1;
      let total = Number.POSITIVE_INFINITY;

      while (collected.length < total) {
        const payload = await getter(page, pageSize);
        const items = Array.isArray(payload?.items) ? payload.items : [];
        collected.push(...items);
        total = Number.isFinite(Number(payload?.total)) ? Number(payload.total) : collected.length;
        if (items.length < pageSize) break;
        page += 1;
      }

      return collected;
    };

    const labels = ["resumo", "pagamentos", "gastos", "ordens", "salarios", "funcionarios"];
    const responses = await Promise.allSettled([
      window.CRMApi.getFinancialDashboard({ period: "all" }),
      fetchAll((page, size) => window.CRMApi.getPayments({ page, pageSize: size })),
      fetchAll((page, size) => window.CRMApi.getFinancialExpenses({ page, pageSize: size })),
      fetchAll((page, size) => window.CRMApi.getOrders({ page, pageSize: size })),
      fetchAll((page, size) => window.CRMApi.getSalaries({ page, pageSize: size })),
      fetchAll((page, size) => window.CRMApi.getEmployees({ page, pageSize: size }))
    ]);

    const warnings = [];
    const [summaryResult, paymentsResult, expensesResult, ordersResult, salariesResult, employeesResult] = responses;

    state.dashboardSummary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
    state.payments = paymentsResult.status === "fulfilled" ? paymentsResult.value : [];
    state.expenses = expensesResult.status === "fulfilled" ? expensesResult.value : [];
    state.orders = ordersResult.status === "fulfilled" ? ordersResult.value : [];
    state.salaries = salariesResult.status === "fulfilled" ? salariesResult.value.map(normalizeSalaryRow) : [];
    state.employees = employeesResult.status === "fulfilled" ? employeesResult.value : [];

    [summaryResult, paymentsResult, expensesResult, ordersResult, salariesResult, employeesResult].forEach((result, index) => {
      if (result.status === "rejected") {
        warnings.push(`${labels[index]}: ${result.reason && result.reason.message ? result.reason.message : "erro"}`);
      }
    });

    state.year = getLatestYear();
    state.warnings = warnings;
    state.loadedAt = new Date();
    return warnings;
  }

  async function updateDashboard() {
    if (els.refreshBtn) els.refreshBtn.disabled = true;

    try {
      await loadData();
      renderAll();

      if (state.warnings.length) {
        setFeedback("Alguns dados não carregaram. Clique em Atualizar.", true);
      } else {
        setFeedback("", false);
      }
    } finally {
      if (els.refreshBtn) els.refreshBtn.disabled = false;
    }
  }

  function bindEvents() {
    if (els.refreshBtn) els.refreshBtn.addEventListener("click", scheduleRefresh);

    document.querySelectorAll(".profit-legend-toggle[data-profit-view]").forEach((button) => {
      button.addEventListener("click", () => {
        state.chartView = button.dataset.profitView || "all";
        document.querySelectorAll(".profit-legend-toggle[data-profit-view]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        renderChart();
      });
    });

    window.addEventListener("crm:remote-sync", scheduleRefresh);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scheduleRefresh();
    });
    window.addEventListener("focus", scheduleRefresh);
  }

  async function bootstrap() {
    const session = await window.CRMAuth.ensureAuth();
    if (!session) return;

    if (window.CRM && typeof window.CRM.ensureEmployees === "function") {
      window.CRM.ensureEmployees();
    }
    window.CRMAuth.bindLogout();
    renderSessionInfo(session);
    bindEvents();

    try {
      await updateDashboard();
    } catch (error) {
      setFeedback(error && error.message ? error.message : "Falha ao carregar dashboard.", true);
    }
  }

  bootstrap();
})();
