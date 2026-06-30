(function () {
  const feedback = document.getElementById("mainFeedback");
  const servicesBody = document.getElementById("servicesBody");
  const serviceSearch = document.getElementById("serviceSearch");
  const serviceStatusFilter = document.getElementById("serviceStatusFilter");
  const serviceDateFilter = document.getElementById("serviceDateFilter");
  const servicePriorityFilter = document.getElementById("servicePriorityFilter");
  const serviceTypeFilter = document.getElementById("serviceTypeFilter");
  const serviceTeamFilter = document.getElementById("serviceTeamFilter");
  const clearServiceFilters = document.getElementById("clearServiceFilters");

  const detailEmpty = document.getElementById("serviceDetailEmpty");
  const detailContent = document.getElementById("serviceDetailContent");
  const detailTitle = document.getElementById("serviceDetailTitle");
  const detailClient = document.getElementById("serviceDetailClient");
  const detailTeam = document.getElementById("serviceDetailTeam");
  const detailStart = document.getElementById("serviceDetailStart");
  const detailDuration = document.getElementById("serviceDetailDuration");
  const detailType = document.getElementById("serviceDetailType");
  const detailPriority = document.getElementById("serviceDetailPriority");
  const detailStatus = document.getElementById("serviceDetailStatus");
  const detailPrice = document.getElementById("serviceDetailPrice");
  const detailExtras = document.getElementById("serviceDetailExtras");

  const kpiScheduled = document.getElementById("kpiServicesScheduled");
  const kpiRunning = document.getElementById("kpiServicesRunning");
  const kpiDone = document.getElementById("kpiServicesDone");
  const kpiCancelled = document.getElementById("kpiServicesCancelled");
  const kpiRevenue = document.getElementById("kpiServicesRevenue");

  const requestsBody = document.getElementById("requestsBody");
  const selectedRequestInfo = document.getElementById("selectedRequestInfo");

  let clients = [];
  let catalogServices = [];
  let orders = [];
  let selectedOrderId = "";

  const filters = {
    query: "",
    status: "",
    date: "",
    priority: "",
    type: "",
    team: ""
  };

  function show(message, ok = true) {
    feedback.textContent = message;
    feedback.className = "feedback " + (ok ? "ok" : "err");
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

  function statusLabel(status) {
    if (status === "scheduled") return "Agendado";
    if (status === "paid") return "Pago";
    if (status === "completed") return "Concluido";
    if (status === "in_progress") return "Em execucao";
    if (status === "cancelled") return "Cancelado";
    return status || "-";
  }

  function filterStatus(order) {
    if (!filters.status) return true;
    const map = {
      agendado: "scheduled",
      em_execucao: "in_progress",
      concluido: "completed",
      cancelado: "cancelled"
    };
    const expected = map[filters.status] || filters.status;
    return String(order.status || "") === expected;
  }

  function renderKpis() {
    const counts = {
      scheduled: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0
    };

    let revenue = 0;
    orders.forEach((order) => {
      const status = String(order.status || "scheduled");
      if (counts[status] !== undefined) counts[status] += 1;
      revenue += Number(order.total_amount || 0);
    });

    kpiScheduled.textContent = String(counts.scheduled || 0);
    kpiRunning.textContent = String(counts.in_progress || 0);
    kpiDone.textContent = String((counts.completed || 0) + (counts.paid || 0));
    kpiCancelled.textContent = String(counts.cancelled || 0);
    kpiRevenue.textContent = money(revenue);
  }

  function fillSelects() {
    const clientSelect = document.getElementById("sClient");
    const serviceSelect = document.getElementById("sTeam");

    clientSelect.innerHTML = clients.map((client) => `<option value="${client.id}">${esc(client.name)}</option>`).join("");
    serviceSelect.innerHTML = catalogServices.map((service) => `<option value="${service.id}">${esc(service.name)} (${money(service.price)})</option>`).join("");

    const currentServiceFilter = filters.team || serviceTeamFilter.value || "";
    serviceTeamFilter.innerHTML = [
      `<option value="">Todos os servicos</option>`,
      ...catalogServices.map((service) => `<option value="${service.id}" ${currentServiceFilter === service.id ? "selected" : ""}>${esc(service.name)}</option>`)
    ].join("");
  }

  function getFilteredOrders() {
    return orders.filter((order) => {
      const clientName = String(order.client_name || "").toLowerCase();
      const serviceName = String(order.service_name || "").toLowerCase();
      const queryOk = !filters.query || clientName.includes(filters.query) || serviceName.includes(filters.query);
      const dateOk = !filters.date || String(order.scheduled_at || "").slice(0, 10) === filters.date;
      const typeOk = !filters.type || true;
      const priorityOk = !filters.priority || true;
      const serviceOk = !filters.team || String(order.service_id || "") === filters.team;
      return queryOk && filterStatus(order) && dateOk && typeOk && priorityOk && serviceOk;
    });
  }

  function renderTable() {
    const filtered = getFilteredOrders();

    if (selectedOrderId && !orders.some((order) => order.id === selectedOrderId)) {
      selectedOrderId = "";
    }

    servicesBody.innerHTML = filtered.map((order) => `
      <tr data-row-id="${order.id}" class="${selectedOrderId === order.id ? "is-selected-row" : ""}">
        <td>
          <div class="service-date">${new Date(order.scheduled_at).toLocaleString("pt-PT")}</div>
          <div class="muted">${order.id.slice(0, 8)}</div>
        </td>
        <td>${esc(order.client_name || "-")}</td>
        <td>${esc(order.service_name || "-")}</td>
        <td>-</td>
        <td>-</td>
        <td>${money(order.total_amount)}</td>
        <td><span class="service-status">${esc(statusLabel(order.status))}</span></td>
        <td>
          <div class="toolbar">
            <button class="secondary" data-action="open-detail" data-id="${order.id}">Detalhe</button>
          </div>
        </td>
      </tr>
    `).join("") || "<tr><td colspan='8'>Sem ordens para este filtro.</td></tr>";
  }

  function getSelectedOrder() {
    if (!selectedOrderId) return null;
    return orders.find((order) => order.id === selectedOrderId) || null;
  }

  function renderDetail() {
    const order = getSelectedOrder();
    if (!order) {
      detailEmpty.style.display = "block";
      detailContent.style.display = "none";
      return;
    }

    detailEmpty.style.display = "none";
    detailContent.style.display = "grid";

    detailTitle.textContent = order.client_name || "-";
    detailClient.textContent = order.client_name || "-";
    detailTeam.textContent = order.service_name || "-";
    detailStart.textContent = order.scheduled_at ? new Date(order.scheduled_at).toLocaleString("pt-PT") : "-";
    detailDuration.textContent = "-";
    detailType.textContent = "-";
    detailPriority.textContent = "-";
    detailStatus.textContent = statusLabel(order.status);
    detailPrice.textContent = money(order.total_amount);
    detailExtras.textContent = order.notes || "Sem notas";

    document.getElementById("serviceDetailStartBtn").disabled = true;
    document.getElementById("serviceDetailConcludeBtn").disabled = true;
    document.getElementById("serviceDetailInvoiceBtn").disabled = true;
  }

  function renderRequestsPlaceholder() {
    selectedRequestInfo.style.display = "none";
    requestsBody.innerHTML = "<tr><td colspan='7'>Pedidos publicos nao integrados neste backend.</td></tr>";
  }

  function renderAll() {
    fillSelects();
    renderKpis();
    renderTable();
    renderDetail();
    renderRequestsPlaceholder();
  }

  async function loadAllData() {
    const [clientsResponse, servicesResponse, ordersResponse] = await Promise.all([
      window.CRMApi.getClients({ page: 1, pageSize: 500 }),
      window.CRMApi.getServices({ page: 1, pageSize: 500 }),
      window.CRMApi.getOrders({ page: 1, pageSize: 500 })
    ]);

    clients = clientsResponse.items || [];
    catalogServices = servicesResponse.items || [];
    orders = ordersResponse.items || [];
  }

  async function createOrder(event) {
    event.preventDefault();

    const clientId = document.getElementById("sClient").value;
    const serviceId = document.getElementById("sTeam").value;
    const startAt = document.getElementById("sStart").value;
    const notes = document.getElementById("sExtras").value;

    if (!clientId || !serviceId || !startAt) {
      show("Cliente, servico e data sao obrigatorios.", false);
      return;
    }

    try {
      await window.CRMApi.createOrder({
        clientId,
        serviceId,
        scheduledAt: new Date(startAt).toISOString(),
        notes: notes || undefined
      });

      event.target.reset();
      await loadAllData();
      renderAll();
      show("Ordem de servico criada com sucesso.", true);
    } catch (error) {
      show(error && error.message ? error.message : "Falha ao criar ordem.", false);
    }
  }

  async function bootstrap() {
    const session = await window.CRMAuth.ensureAuth();
    if (!session) return;

    window.CRMAuth.bindLogout();

    document.getElementById("serviceForm").addEventListener("submit", createOrder);

    document.body.addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-row-id]");
      if (row && !event.target.closest("button")) {
        selectedOrderId = row.dataset.rowId || "";
        renderDetail();
        renderTable();
        return;
      }

      const button = event.target.closest("button[data-action]");
      if (!button) return;

      if (button.dataset.action === "open-detail") {
        selectedOrderId = button.dataset.id || "";
        renderDetail();
        renderTable();
      }
    });

    document.getElementById("serviceDetailStartBtn").addEventListener("click", () => show("Alteracao de estado nao disponivel via API atual.", false));
    document.getElementById("serviceDetailConcludeBtn").addEventListener("click", () => show("Alteracao de estado nao disponivel via API atual.", false));
    document.getElementById("serviceDetailInvoiceBtn").addEventListener("click", () => show("Geracao de fatura nao disponivel via API atual.", false));
    document.getElementById("serviceDetailDeleteBtn").addEventListener("click", () => show("Eliminacao de ordens nao disponivel via API atual.", false));

    serviceSearch.addEventListener("input", () => {
      filters.query = String(serviceSearch.value || "").trim().toLowerCase();
      renderTable();
    });

    serviceStatusFilter.addEventListener("change", () => {
      filters.status = serviceStatusFilter.value;
      renderTable();
    });

    serviceDateFilter.addEventListener("change", () => {
      filters.date = serviceDateFilter.value;
      renderTable();
    });

    servicePriorityFilter.addEventListener("change", () => {
      filters.priority = servicePriorityFilter.value;
      renderTable();
    });

    serviceTypeFilter.addEventListener("change", () => {
      filters.type = serviceTypeFilter.value;
      renderTable();
    });

    serviceTeamFilter.addEventListener("change", () => {
      filters.team = serviceTeamFilter.value;
      renderTable();
    });

    clearServiceFilters.addEventListener("click", () => {
      filters.query = "";
      filters.status = "";
      filters.date = "";
      filters.priority = "";
      filters.type = "";
      filters.team = "";
      serviceSearch.value = "";
      serviceStatusFilter.value = "";
      serviceDateFilter.value = "";
      servicePriorityFilter.value = "";
      serviceTypeFilter.value = "";
      serviceTeamFilter.value = "";
      renderTable();
    });

    try {
      await loadAllData();
      renderAll();
      if (!catalogServices.length) show("Nao existem servicos no catalogo. Crie servicos no backend para agendar ordens.", false);
    } catch (error) {
      show(error && error.message ? error.message : "Falha ao carregar dados de servicos.", false);
    }
  }

  bootstrap();
})();
