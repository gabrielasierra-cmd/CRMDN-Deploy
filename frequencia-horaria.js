(async function () {
  const session = await CRMAuth.ensureAuth();
  if (!session) return;
  CRMAuth.bindLogout();

  const feedback = document.getElementById("mainFeedback");
  const workHourForm = document.getElementById("workHourForm");
  const workHourWorker = document.getElementById("workHourWorker");
  const workHourDate = document.getElementById("workHourDate");
  const workHourHours = document.getElementById("workHourHours");
  const workHourLocation = document.getElementById("workHourLocation");
  const workHourSubmitBtn = document.getElementById("workHourSubmitBtn");
  const workHourCancelBtn = document.getElementById("workHourCancelBtn");
  const workerFilter = document.getElementById("workerFilter");
  const localFilter = document.getElementById("localFilter");
  const startDateFilter = document.getElementById("startDateFilter");
  const endDateFilter = document.getElementById("endDateFilter");
  const applyFiltersBtn = document.getElementById("applyFiltersBtn");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const monthlyReportBtn = document.getElementById("monthlyReportBtn");
  const workHoursBody = document.getElementById("workHoursBody");
  const workerRankingBody = document.getElementById("workerRankingBody");
  const localTotalsBody = document.getElementById("localTotalsBody");
  const workerChart = document.getElementById("workerChart");
  const localChart = document.getElementById("localChart");
  const heatmapTable = document.getElementById("heatmapTable");
  const totalHoursValue = document.getElementById("totalHoursValue");
  const recordsCountValue = document.getElementById("recordsCountValue");
  const topWorkerValue = document.getElementById("topWorkerValue");
  const topLocationValue = document.getElementById("topLocationValue");
  const workersCountValue = document.getElementById("workersCountValue");
  const locationsCountValue = document.getElementById("locationsCountValue");
  const averageHoursValue = document.getElementById("averageHoursValue");
  const monthlyReportModal = document.getElementById("monthlyReportModal");
  const monthlyReportTitle = document.getElementById("monthlyReportTitle");
  const monthlyReportMeta = document.getElementById("monthlyReportMeta");
  const monthlyReportStats = document.getElementById("monthlyReportStats");
  const monthlyReportBody = document.getElementById("monthlyReportBody");
  const monthlyReportFooter = document.getElementById("monthlyReportFooter");

  let employees = [];
  let records = [];
  let stats = { summary: { totalHours: 0, totalRecords: 0, workerCount: 0, locationCount: 0 }, workerTotals: [], locationTotals: [], heatmap: [] };
  let editingId = "";
  let monthlyReportPrintData = null;

  const numberFormatter = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function show(message, ok = true) {
    feedback.textContent = message;
    feedback.className = "feedback " + (ok ? "ok" : "err");
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function toInputDate(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function todayISO() {
    return toInputDate(new Date());
  }

  function monthRange(date = new Date()) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return {
      startDate: toInputDate(start),
      endDate: toInputDate(end)
    };
  }

  function formatDate(value) {
    if (!value) return "-";
    const raw = String(value);
    const date = /^\d{4}-\d{2}-\d{2}/.test(raw) ? new Date(`${raw.slice(0, 10)}T00:00:00`) : new Date(raw);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("pt-PT");
  }

  function formatHours(value) {
    return `${numberFormatter.format(Number(value || 0))}h`;
  }

  function normalizeEmployee(employee) {
    return {
      id: employee.id,
      name: employee.full_name || employee.name || "-",
      email: employee.email || "",
      phone: employee.phone || ""
    };
  }

  function normalizeRecord(record) {
    return {
      id: record.id,
      employeeId: record.id_trabalhador,
      employeeName: record.trabalhador_nome || record.employee_name || "-",
      date: record.data,
      hours: Number(record.horas_trabalhadas || 0),
      location: record.local_trabalho || "",
      createdAt: record.created_at || "",
      updatedAt: record.updated_at || ""
    };
  }

  function getFilters() {
    return {
      employeeId: workerFilter.value || "",
      local: localFilter.value.trim(),
      startDate: startDateFilter.value || "",
      endDate: endDateFilter.value || ""
    };
  }

  function setDefaultDateFilters() {
    const range = monthRange();
    if (!startDateFilter.value) startDateFilter.value = range.startDate;
    if (!endDateFilter.value) endDateFilter.value = range.endDate;
  }

  function buildQueryParams() {
    const filters = getFilters();
    return {
      page: 1,
      pageSize: 500,
      employeeId: filters.employeeId || undefined,
      local: filters.local || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined
    };
  }

  function buildCurrentPeriodTitle() {
    if (startDateFilter.value && endDateFilter.value) {
      if (startDateFilter.value.slice(0, 7) === endDateFilter.value.slice(0, 7) && startDateFilter.value.slice(8) === "01") {
        const month = new Date(`${startDateFilter.value}T00:00:00`);
        return month.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
      }
      return `${formatDate(startDateFilter.value)} - ${formatDate(endDateFilter.value)}`;
    }
    return "Periodo filtrado";
  }

  function updateEmployeeSelects() {
    const selectedWorkerFilter = workerFilter.value || "";
    const selectedFormWorker = workHourWorker.value || "";
    const options = employees
      .map((employee) => `<option value="${esc(employee.id)}">${esc(employee.name)}</option>`)
      .join("");

    workHourWorker.innerHTML = options;
    workerFilter.innerHTML = `<option value="">Todos os trabalhadores</option>${options}`;

    if (selectedWorkerFilter && employees.some((employee) => employee.id === selectedWorkerFilter)) {
      workerFilter.value = selectedWorkerFilter;
    }

    if (selectedFormWorker && employees.some((employee) => employee.id === selectedFormWorker)) {
      workHourWorker.value = selectedFormWorker;
    } else if (!workHourWorker.value && employees.length) {
      workHourWorker.value = employees[0].id;
    }
  }

  function renderTable() {
    const rows = records.map((record) => `
      <tr data-id="${esc(record.id)}">
        <td>${esc(formatDate(record.date))}</td>
        <td>${esc(record.employeeName)}</td>
        <td>${esc(record.location)}</td>
        <td>${esc(formatHours(record.hours))}</td>
        <td class="workhours-actions-cell">
          <button type="button" class="workhour-edit-btn" data-action="edit" data-id="${esc(record.id)}">Corrigir</button>
          <button type="button" class="workhour-delete-btn" data-action="delete" data-id="${esc(record.id)}">Eliminar</button>
        </td>
      </tr>
    `).join("");

    workHoursBody.innerHTML = rows || "<tr><td colspan='5' class='muted' style='padding:10px'>Sem registos para este filtro.</td></tr>";
  }

  function renderKpis() {
    const summary = stats.summary || {};
    const workerTotals = stats.workerTotals || [];
    const locationTotals = stats.locationTotals || [];
    const totalHours = Number(summary.totalHours || 0);
    const totalRecords = Number(summary.totalRecords || 0);
    const average = totalRecords ? totalHours / totalRecords : 0;

    totalHoursValue.textContent = formatHours(totalHours);
    recordsCountValue.textContent = String(totalRecords);
    workersCountValue.textContent = String(Number(summary.workerCount || workerTotals.length || 0));
    locationsCountValue.textContent = String(Number(summary.locationCount || locationTotals.length || 0));
    averageHoursValue.textContent = formatHours(average);
    topWorkerValue.textContent = workerTotals[0] ? `${workerTotals[0].employeeName} (${formatHours(workerTotals[0].totalHours)})` : "-";
    topLocationValue.textContent = locationTotals[0] ? `${locationTotals[0].localTrabalho} (${formatHours(locationTotals[0].totalHours)})` : "-";
  }

  function renderRankingTables() {
    const workerTotals = stats.workerTotals || [];
    const locationTotals = stats.locationTotals || [];

    workerRankingBody.innerHTML = workerTotals.length
      ? workerTotals.map((row) => `
        <tr>
          <td>${esc(row.employeeName)}</td>
          <td>${esc(formatHours(row.totalHours))}</td>
          <td>${esc(String(row.totalRecords))}</td>
        </tr>
      `).join("")
      : "<tr><td colspan='3' class='muted' style='padding:10px'>Sem dados.</td></tr>";

    localTotalsBody.innerHTML = locationTotals.length
      ? locationTotals.map((row) => `
        <tr>
          <td>${esc(row.localTrabalho)}</td>
          <td>${esc(formatHours(row.totalHours))}</td>
          <td>${esc(String(row.totalRecords))}</td>
        </tr>
      `).join("")
      : "<tr><td colspan='3' class='muted' style='padding:10px'>Sem dados.</td></tr>";
  }

  function renderBars(container, items, emptyLabel) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = `<div class="muted workhours-empty">${emptyLabel}</div>`;
      return;
    }

    const max = Math.max(1, ...items.map((item) => Number(item.totalHours || 0)));
    container.innerHTML = items
      .map((item) => {
        const value = Number(item.totalHours || 0);
        const height = Math.max(6, Math.round((value / max) * 160));
        const label = item.employeeName || item.localTrabalho || "-";
        const recordsLabel = Number(item.totalRecords || 0);
        const tooltip = `${label} | ${formatHours(value)} | ${recordsLabel} registos`;
        return `
          <div class="workhours-bar-item" title="${esc(tooltip)}">
            <div class="workhours-bar-track">
              <div class="workhours-bar-fill" style="height:${height}px"></div>
            </div>
            <div class="workhours-bar-label">${esc(label)}</div>
            <strong>${esc(formatHours(value))}</strong>
            <span>${esc(String(recordsLabel))} registos</span>
          </div>
        `;
      })
      .join("");
  }

  function renderCharts() {
    renderBars(workerChart, stats.workerTotals || [], "Sem horas por trabalhador para este periodo.");
    renderBars(localChart, stats.locationTotals || [], "Sem horas por local para este periodo.");
  }

  function renderHeatmap() {
    const workerTotals = stats.workerTotals || [];
    const locationTotals = stats.locationTotals || [];
    const heatmap = stats.heatmap || [];

    if (!workerTotals.length || !locationTotals.length) {
      heatmapTable.innerHTML = `<div class="muted workhours-empty">Sem dados para construir o heatmap.</div>`;
      return;
    }

    const cells = new Map(heatmap.map((entry) => [`${entry.employeeId}|${entry.localTrabalho}`, entry]));
    const maxCount = Math.max(1, ...heatmap.map((entry) => Number(entry.totalRecords || 0)));

    const headerCells = locationTotals.map((row) => `<th>${esc(row.localTrabalho)}</th>`).join("");
    const bodyRows = workerTotals.map((worker) => {
      const rowCells = locationTotals.map((location) => {
        const key = `${worker.employeeId}|${location.localTrabalho}`;
        const cell = cells.get(key);
        const count = Number(cell?.totalRecords || 0);
        const hours = Number(cell?.totalHours || 0);
        const alpha = count ? Math.min(0.88, 0.08 + (count / maxCount) * 0.8) : 0.03;
        const foreground = alpha > 0.42 ? "#ffffff" : "#12324f";
        return `
          <td style="background: rgba(21, 76, 121, ${alpha}); color: ${foreground};"
              title="${esc(`${worker.employeeName} | ${location.localTrabalho} | ${count} registos | ${formatHours(hours)}`)}">
            <strong>${esc(String(count))}</strong>
            <span>${esc(formatHours(hours))}</span>
          </td>
        `;
      }).join("");

      return `
        <tr>
          <th scope="row">${esc(worker.employeeName)}</th>
          ${rowCells}
        </tr>
      `;
    }).join("");

    heatmapTable.innerHTML = `
      <table class="workhours-heatmap-table">
        <thead>
          <tr>
            <th>Trabalhador / Local</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
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

    const existingFrame = document.getElementById("monthlyReportPrintFrame");
    if (existingFrame) existingFrame.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "monthlyReportPrintFrame";
    iframe.title = "Relatorio mensal de frequencia horaria";
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
        <title>Relatorio mensal de frequencia horaria | ${esc(monthlyReportPrintData.periodTitle)}</title>
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
              <div class="kicker">Relatorio mensal de frequencia horaria</div>
              <h1>${esc(monthlyReportPrintData.periodTitle)}</h1>
              <div class="meta">Gerado em ${esc(monthlyReportPrintData.generatedAt)}</div>
            </div>
            <div class="meta">Locais analisados: ${esc(String(monthlyReportPrintData.locationCount))}</div>
          </div>
          <div class="stats">
            <div class="stat"><span>Total de horas</span><strong>${esc(monthlyReportPrintData.totalHoursLabel)}</strong></div>
            <div class="stat"><span>Registos</span><strong>${esc(String(monthlyReportPrintData.totalRecords))}</strong></div>
            <div class="stat"><span>Top trabalhador</span><strong>${esc(monthlyReportPrintData.topWorkerLabel)}</strong></div>
            <div class="stat"><span>Top local</span><strong>${esc(monthlyReportPrintData.topLocationLabel)}</strong></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Trabalhador</th>
                  <th>Local</th>
                  <th>Horas</th>
                </tr>
              </thead>
              <tbody>${monthlyReportPrintData.rowsHtml}</tbody>
            </table>
          </div>
          <div class="footer">Registos carregados: ${esc(String(monthlyReportPrintData.totalRecords))}</div>
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
    if (!monthlyReportModal || !monthlyReportTitle || !monthlyReportMeta || !monthlyReportStats || !monthlyReportBody || !monthlyReportFooter) {
      show("Nao foi possivel abrir o relatorio.", false);
      return;
    }

    const periodTitle = buildCurrentPeriodTitle();
    const generatedAt = new Date().toLocaleString("pt-PT");
    const totalHours = Number(stats.summary?.totalHours || 0);
    const totalRecords = Number(stats.summary?.totalRecords || 0);
    const topWorker = (stats.workerTotals || [])[0];
    const topLocation = (stats.locationTotals || [])[0];
    const locationCount = Number(stats.summary?.locationCount || (stats.locationTotals || []).length || 0);

    const rowsHtml = records.length
      ? records.map((record) => `
        <tr>
          <td>${esc(formatDate(record.date))}</td>
          <td>${esc(record.employeeName)}</td>
          <td>${esc(record.location)}</td>
          <td>${esc(formatHours(record.hours))}</td>
        </tr>
      `).join("")
      : "<tr><td colspan='4'>Sem registos para este filtro.</td></tr>";

    monthlyReportTitle.textContent = periodTitle;
    monthlyReportMeta.textContent = `Gerado em ${generatedAt}`;
    monthlyReportStats.innerHTML = [
      { label: "Total de horas", value: formatHours(totalHours) },
      { label: "Registos", value: String(totalRecords) },
      { label: "Top trabalhador", value: topWorker ? `${topWorker.employeeName} (${formatHours(topWorker.totalHours)})` : "-" },
      { label: "Top local", value: topLocation ? `${topLocation.localTrabalho} (${formatHours(topLocation.totalHours)})` : "-" }
    ].map((item) => `
      <article class="report-stat">
        <span>${esc(item.label)}</span>
        <strong>${esc(item.value)}</strong>
      </article>
    `).join("");
    monthlyReportBody.innerHTML = rowsHtml;
    monthlyReportFooter.textContent = `Locais analisados: ${String(locationCount)}`;
    monthlyReportModal.hidden = false;
    document.body.style.overflow = "hidden";
    monthlyReportPrintData = {
      periodTitle,
      generatedAt,
      totalHoursLabel: formatHours(totalHours),
      totalRecords,
      topWorkerLabel: topWorker ? `${topWorker.employeeName} (${formatHours(topWorker.totalHours)})` : "-",
      topLocationLabel: topLocation ? `${topLocation.localTrabalho} (${formatHours(topLocation.totalHours)})` : "-",
      locationCount,
      rowsHtml
    };
  }

  function startEdit(recordId) {
    const record = records.find((item) => item.id === recordId);
    if (!record) return;
    editingId = record.id;
    workHourWorker.value = record.employeeId;
    workHourDate.value = record.date;
    workHourHours.value = String(Number(record.hours || 0).toFixed(2));
    workHourLocation.value = record.location;
    workHourSubmitBtn.textContent = "Atualizar registo";
    workHourCancelBtn.hidden = false;
    workHourForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    editingId = "";
    workHourSubmitBtn.textContent = "Registar horas";
    workHourCancelBtn.hidden = true;
    workHourDate.value = todayISO();
    workHourHours.value = "";
    workHourLocation.value = "";
    if (employees.length) {
      workHourWorker.value = employees[0].id;
    }
  }

  async function loadData() {
    setDefaultDateFilters();
    const [employeesPayload, recordsPayload, statsPayload] = await Promise.all([
      window.CRMApi.getEmployees({ page: 1, pageSize: 500 }),
      window.CRMApi.getWorkHours(buildQueryParams()),
      window.CRMApi.getWorkHoursStats(getFilters())
    ]);

    employees = (employeesPayload.items || []).map(normalizeEmployee);
    records = (recordsPayload.items || []).map(normalizeRecord);
    stats = statsPayload || stats;
  }

  function renderAll() {
    updateEmployeeSelects();
    renderKpis();
    renderTable();
    renderRankingTables();
    renderCharts();
    renderHeatmap();
  }

  async function refresh() {
    try {
      await loadData();
      renderAll();
      if (!records.length) {
        show("Sem registos para este filtro.", true);
        return;
      }
      show("Frequencia horaria atualizada.", true);
    } catch (error) {
      show(error && error.message ? error.message : "Falha ao carregar frequencia horaria.", false);
    }
  }

  workHourForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      idTrabalhador: workHourWorker.value,
      data: workHourDate.value,
      horasTrabalhadas: Number(workHourHours.value),
      localTrabalho: workHourLocation.value.trim()
    };

    if (!payload.idTrabalhador || !payload.data || !payload.localTrabalho || !Number.isFinite(payload.horasTrabalhadas) || payload.horasTrabalhadas <= 0) {
      show("Trabalhador, data, horas e local sao obrigatorios.", false);
      return;
    }

    try {
      if (editingId) {
        await window.CRMApi.updateWorkHour(editingId, payload);
        show("Registo atualizado com sucesso.", true);
      } else {
        await window.CRMApi.createWorkHour(payload);
        show("Registo criado com sucesso.", true);
      }
      resetForm();
      await refresh();
    } catch (error) {
      show(error && error.message ? error.message : "Nao foi possivel guardar o registo.", false);
    }
  });

  workHourCancelBtn.addEventListener("click", () => {
    resetForm();
  });

  applyFiltersBtn.addEventListener("click", async () => {
    await refresh();
  });

  refreshBtn.addEventListener("click", async () => {
    await refresh();
  });

  clearFiltersBtn.addEventListener("click", async () => {
    workerFilter.value = "";
    localFilter.value = "";
    const range = monthRange();
    startDateFilter.value = range.startDate;
    endDateFilter.value = range.endDate;
    await refresh();
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

  workHoursBody.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const recordId = button.dataset.id;
    const action = button.dataset.action;
    if (!recordId || !action) return;

    if (action === "edit") {
      startEdit(recordId);
      return;
    }

    if (action === "delete") {
      if (!confirm("Queres eliminar este registo de horas?")) return;
      try {
        await window.CRMApi.deleteWorkHour(recordId);
        if (editingId === recordId) {
          resetForm();
        }
        show("Registo eliminado com sucesso.", true);
        await refresh();
      } catch (error) {
        show(error && error.message ? error.message : "Nao foi possivel eliminar o registo.", false);
      }
    }
  });

  workerFilter.addEventListener("change", refresh);
  localFilter.addEventListener("input", () => {
    clearTimeout(localFilter._timer);
    localFilter._timer = setTimeout(refresh, 350);
  });
  startDateFilter.addEventListener("change", refresh);
  endDateFilter.addEventListener("change", refresh);

  resetForm();
  await refresh();
})();
