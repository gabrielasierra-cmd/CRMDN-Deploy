(function () {
  const els = {
    feedback: document.getElementById("mainFeedback"),
    feedbackText: document.getElementById("dashboardAlertText"),
    feedbackAction: document.getElementById("dashboardAlertAction"),
    refreshBtn: document.getElementById("refreshBtn"),
    refreshQuotesBtn: document.getElementById("refreshQuotesBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    clientSelect: document.getElementById("clientSelect"),
    pricingMode: document.getElementById("pricingMode"),
    tipologiaSelect: document.getElementById("tipologiaSelect"),
    hoursInput: document.getElementById("hoursInput"),
    workersInput: document.getElementById("workersInput"),
    areaInput: document.getElementById("areaInput"),
    floorsInput: document.getElementById("floorsInput"),
    notesInput: document.getElementById("notesInput"),
    videoInput: document.getElementById("videoInput"),
    pricingOptions: document.getElementById("pricingOptions"),
    analyzeBtn: document.getElementById("analyzeBtn"),
    approveBtn: document.getElementById("approveBtn"),
    downloadQuoteBtn: document.getElementById("downloadQuoteBtn"),
    downloadInvoiceBtn: document.getElementById("downloadInvoiceBtn"),
    analysisSummary: document.getElementById("analysisSummary"),
    analysisBadges: document.getElementById("analysisBadges"),
    totalEstimated: document.getElementById("totalEstimated"),
    quoteStatus: document.getElementById("quoteStatus"),
    quoteNumber: document.getElementById("quoteNumber"),
    invoiceNumber: document.getElementById("invoiceNumber"),
    analysisJson: document.getElementById("analysisJson"),
    divisionTableBody: document.getElementById("divisionTableBody"),
    quotesList: document.getElementById("quotesList")
  };

  const state = {
    clients: [],
    quotes: [],
    currentQuote: null,
    selectedFile: null,
    loading: false,
    refreshToken: 0
  };

  function money(value) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function norm(value) {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setFeedback(message, warn = false) {
    if (!els.feedback) return;
    if (!message) {
      els.feedback.hidden = true;
      return;
    }
    els.feedback.hidden = false;
    els.feedback.classList.toggle("is-warn", warn);
    if (els.feedbackText) els.feedbackText.textContent = message;
    if (els.feedbackAction) els.feedbackAction.textContent = "Atualizar";
  }

  function getPricingMode() {
    return String(els.pricingMode?.value || "divisoes");
  }

  function updateModeVisibility() {
    const mode = getPricingMode();
    document.querySelectorAll(".budget-ai-option-group").forEach((group) => {
      const groupMode = group.getAttribute("data-mode");
      group.hidden = groupMode !== mode;
    });
  }

  function selectedClientId() {
    return String(els.clientSelect?.value || "");
  }

  function getSelectedQuoteFile() {
    return state.selectedFile;
  }

  function getSeedOrder() {
    return Array.isArray(window.CRMClientSeed)
      ? window.CRMClientSeed.map((item) => norm(item.cliente)).filter(Boolean)
      : [];
  }

  function seedIndexMap() {
    const map = new Map();
    getSeedOrder().forEach((name, index) => {
      if (!map.has(name)) map.set(name, index);
    });
    return map;
  }

  function buildAnalyzePayload() {
    const payload = {
      clientId: selectedClientId(),
      pricingMode: getPricingMode(),
      notes: String(els.notesInput?.value || "").trim()
    };

    if (payload.pricingMode === "tipologia") {
      payload.tipologia = String(els.tipologiaSelect?.value || "t0_t1_t2_normal");
    }
    if (payload.pricingMode === "pos_obra") {
      payload.hours = Number(els.hoursInput?.value || 0);
      payload.workers = Number(els.workersInput?.value || 0);
    }
    if (payload.pricingMode === "escritorio") {
      payload.areaM2 = Number(els.areaInput?.value || 0);
      payload.floors = Number(els.floorsInput?.value || 0);
    }

    return payload;
  }

  function renderClients() {
    if (!els.clientSelect) return;
    const currentValue = selectedClientId();
    const options = state.clients.length
      ? state.clients
          .map((client) => `<option value="${esc(client.id)}">${esc(client.name)}</option>`)
          .join("")
      : `<option value="">Sem clientes</option>`;
    els.clientSelect.innerHTML = options;
    if (currentValue && state.clients.some((client) => client.id === currentValue)) {
      els.clientSelect.value = currentValue;
    }
  }

  function renderAnalysis(quote) {
    state.currentQuote = quote || null;

    if (!quote) {
      if (els.analysisSummary) els.analysisSummary.textContent = "Aguardando video.";
      if (els.analysisJson) els.analysisJson.textContent = "Sem dados para mostrar.";
      if (els.totalEstimated) els.totalEstimated.textContent = money(0);
      if (els.quoteStatus) els.quoteStatus.textContent = "-";
      if (els.quoteNumber) els.quoteNumber.textContent = "-";
      if (els.invoiceNumber) els.invoiceNumber.textContent = "-";
      if (els.divisionTableBody) {
        els.divisionTableBody.innerHTML = `<tr><td colspan="5">Sem analise carregada.</td></tr>`;
      }
      if (els.analysisBadges) els.analysisBadges.innerHTML = "";
      toggleActionButtons();
      return;
    }

    const analysis = quote.analysis || {};
    const divisions = Array.isArray(analysis.divisoes) ? analysis.divisoes : [];
    if (els.analysisSummary) {
      els.analysisSummary.textContent = `${divisions.length} divisões analisadas.`;
    }
    if (els.totalEstimated) els.totalEstimated.textContent = money(quote.estimatedTotal || analysis.total_estimado || 0);
    if (els.quoteStatus) els.quoteStatus.textContent = quote.status === "review_required" ? "Revisão obrigatória" : quote.status;
    if (els.quoteNumber) els.quoteNumber.textContent = quote.quoteNumber || "-";
    if (els.invoiceNumber) els.invoiceNumber.textContent = quote.invoiceNumber || "-";

    const badges = [];
    if (quote.reviewRequired || analysis.reviewRequired) badges.push("Revisão");
    if (analysis.summary && analysis.summary.pricingMode) badges.push(String(analysis.summary.pricingMode));
    if (quote.invoiceNumber) badges.push("Fatura gerada");
    if (els.analysisBadges) {
      els.analysisBadges.innerHTML = badges
        .map((badge) => `<span>${esc(badge)}</span>`)
        .join("");
    }

    if (els.analysisJson) {
      els.analysisJson.textContent = JSON.stringify(
        {
          quoteNumber: quote.quoteNumber,
          invoiceNumber: quote.invoiceNumber,
          status: quote.status,
          analysis
        },
        null,
        2
      );
    }

    if (els.divisionTableBody) {
      els.divisionTableBody.innerHTML = divisions.length
        ? divisions
            .map((division) => `
              <tr>
                <td>${esc(division.tipo)}</td>
                <td>${esc(division.nivel_sujidade)}</td>
                <td>${esc(division.tamanho)}</td>
                <td>${esc((division.itens_detectados || []).join(", ") || "-")}</td>
                <td>${esc(money(division.valor_estimado || 0))}</td>
              </tr>
            `)
            .join("")
        : `<tr><td colspan="5">Sem divisões detectadas.</td></tr>`;
    }

    toggleActionButtons();
  }

  function toggleActionButtons() {
    const quote = state.currentQuote;
    const hasQuote = Boolean(quote);
    const hasQuoteDoc = Boolean(quote && quote.quoteDocPath);
    const hasInvoiceDoc = Boolean(quote && quote.invoiceDocPath);

    if (els.approveBtn) els.approveBtn.disabled = !hasQuote;
    if (els.downloadQuoteBtn) els.downloadQuoteBtn.disabled = !hasQuoteDoc;
    if (els.downloadInvoiceBtn) els.downloadInvoiceBtn.disabled = !hasInvoiceDoc;
  }

  function renderQuotesList() {
    if (!els.quotesList) return;
    if (!state.quotes.length) {
      els.quotesList.innerHTML = `<div class="dashboard-pending-empty">Sem orcamentos recentes.</div>`;
      return;
    }

    els.quotesList.innerHTML = state.quotes
      .map((quote) => `
        <article class="budget-ai-history-item">
          <div class="budget-ai-history-main">
            <strong>${esc(quote.clientName || "-")}</strong>
            <span>${esc(quote.quoteNumber || "-")} · ${esc(quote.serviceMode || "-")} · ${esc(quote.status || "-")}</span>
          </div>
          <div class="budget-ai-history-side">
            <strong>${esc(money(quote.estimatedTotal || 0))}</strong>
            <span>${esc(Number.isNaN(new Date(quote.createdAt).getTime()) ? "-" : new Date(quote.createdAt).toLocaleDateString("pt-PT"))}</span>
          </div>
        </article>
      `)
      .join("");
  }

  async function loadClients() {
    const payload = await window.CRMApi.getClients({ page: 1, pageSize: 500 });
    const raw = Array.isArray(payload.items) ? payload.items : [];
    const seedNames = getSeedOrder();

    if (seedNames.length) {
      const order = seedIndexMap();
      state.clients = raw
        .filter((client) => order.has(norm(client.name)))
        .sort((a, b) => (order.get(norm(a.name)) ?? 0) - (order.get(norm(b.name)) ?? 0));
    } else {
      state.clients = raw;
    }

    renderClients();
  }

  async function loadQuotes() {
    const payload = await window.CRMApi.listVideoQuotes({ page: 1, pageSize: 10 });
    state.quotes = Array.isArray(payload.items)
      ? [...payload.items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : [];
    renderQuotesList();
  }

  async function refreshAll() {
    if (state.loading) return;
    state.loading = true;
    const token = ++state.refreshToken;
    if (els.refreshBtn) els.refreshBtn.disabled = true;
    if (els.refreshQuotesBtn) els.refreshQuotesBtn.disabled = true;
    try {
      await Promise.all([loadClients(), loadQuotes()]);
      if (token !== state.refreshToken) return;
      if (!state.currentQuote && state.quotes[0]) {
        renderAnalysis(state.quotes[0]);
      }
      setFeedback("");
    } catch (error) {
      setFeedback(error && error.message ? error.message : "Falha ao carregar orcamentos.", true);
    } finally {
      if (token !== state.refreshToken) {
        state.loading = false;
        return;
      }
      state.loading = false;
      if (els.refreshBtn) els.refreshBtn.disabled = false;
      if (els.refreshQuotesBtn) els.refreshQuotesBtn.disabled = false;
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function analyzeCurrentVideo() {
    const file = getSelectedQuoteFile();
    if (!file) {
      setFeedback("Seleciona um video primeiro.", true);
      return;
    }
    if (!selectedClientId()) {
      setFeedback("Seleciona um cliente primeiro.", true);
      return;
    }

    if (els.analyzeBtn) els.analyzeBtn.disabled = true;
    setFeedback("A analisar o video... isto pode demorar um pouco.", false);
    try {
      const payload = buildAnalyzePayload();
      const quote = await window.CRMApi.analyzeVideoQuote(file, payload);
      renderAnalysis(quote);
      await loadQuotes();
      setFeedback("Analise concluida com sucesso.");
    } catch (error) {
      setFeedback(error && error.message ? error.message : "Falha ao analisar o video.", true);
    } finally {
      if (els.analyzeBtn) els.analyzeBtn.disabled = false;
    }
  }

  async function approveQuote() {
    if (!state.currentQuote) return;
    if (els.approveBtn) els.approveBtn.disabled = true;
    setFeedback("A gerar a fatura...", false);
    try {
      const quote = await window.CRMApi.approveVideoQuote(state.currentQuote.id, {});
      renderAnalysis(quote);
      await loadQuotes();
      setFeedback("Fatura gerada com sucesso.");
    } catch (error) {
      setFeedback(error && error.message ? error.message : "Falha ao aprovar o orcamento.", true);
    } finally {
      if (els.approveBtn) els.approveBtn.disabled = false;
    }
  }

  async function downloadDocument(kind) {
    if (!state.currentQuote) return;
    try {
      const blob = await window.CRMApi.downloadVideoQuoteDocument(state.currentQuote.id, kind);
      const filename =
        kind === "quote"
          ? `${state.currentQuote.quoteNumber || "orcamento"}.docx`
          : `${state.currentQuote.invoiceNumber || "fatura"}.docx`;
      downloadBlob(blob, filename);
    } catch (error) {
      setFeedback(error && error.message ? error.message : "Falha ao descarregar o documento.", true);
    }
  }

  function bindEvents() {
    if (els.refreshBtn) els.refreshBtn.addEventListener("click", refreshAll);
    if (els.refreshQuotesBtn) els.refreshQuotesBtn.addEventListener("click", refreshAll);
    if (els.feedbackAction) els.feedbackAction.addEventListener("click", refreshAll);
    if (els.pricingMode) els.pricingMode.addEventListener("change", updateModeVisibility);
    if (els.videoInput) {
      els.videoInput.addEventListener("change", () => {
        state.selectedFile = els.videoInput.files && els.videoInput.files[0] ? els.videoInput.files[0] : null;
      });
    }
    if (els.analyzeBtn) els.analyzeBtn.addEventListener("click", analyzeCurrentVideo);
    if (els.approveBtn) els.approveBtn.addEventListener("click", approveQuote);
    if (els.downloadQuoteBtn) els.downloadQuoteBtn.addEventListener("click", () => downloadDocument("quote"));
    if (els.downloadInvoiceBtn) els.downloadInvoiceBtn.addEventListener("click", () => downloadDocument("invoice"));
  }

  async function bootstrap() {
    const session = await window.CRMAuth.ensureAuth();
    if (!session) return;

    window.CRMAuth.bindLogout();
    bindEvents();
    updateModeVisibility();

    try {
      await refreshAll();
    } catch (error) {
      setFeedback(error && error.message ? error.message : "Falha ao inicializar a pagina.", true);
    }
  }

  bootstrap();
})();
