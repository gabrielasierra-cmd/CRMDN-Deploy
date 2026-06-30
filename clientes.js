(function () {
  const els = {
    sessionInfo: document.getElementById("sessionInfo"),
    clientsSearch: document.getElementById("clientsSearch"),
    clientsSortMode: document.getElementById("clientsSortMode"),
    clientsSummary: document.getElementById("clientsSummary"),
    clientsRangeInfo: document.getElementById("clientsRangeInfo"),
    clientsBody: document.getElementById("clientsBody"),
    clientsCards: document.getElementById("clientsCards"),
    clientsEmpty: document.getElementById("clientsEmpty"),
    clientsTableWrap: document.getElementById("clientsTableWrap")
  };

  const state = {
    rows: [],
    filtered: [],
    sortMode: "name-asc"
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function norm(value) {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function isFilled(value) {
    const text = String(value ?? "").trim();
    return text && text !== "—" && text !== "-" && text.toLowerCase() !== "por preencher";
  }

  function getSeedRows() {
    const source = Array.isArray(window.CRMClientSeed) ? window.CRMClientSeed : [];
    return source.map((item) => ({
      cliente: String(item.cliente || "").trim(),
      nome_legal: String(item.nome_legal || "").trim(),
      endereco: String(item.endereco || "").trim(),
      nif: String(item.nif || "").trim()
    }));
  }

  function sortRows(rows) {
    const sorted = [...rows];
    sorted.sort((a, b) => a.cliente.localeCompare(b.cliente, "pt", { sensitivity: "base" }));
    if (state.sortMode === "name-desc") {
      sorted.reverse();
    }
    return sorted;
  }

  function matchesSearch(row) {
    const query = norm(els.clientsSearch ? els.clientsSearch.value : "");
    if (!query) return true;

    return [
      row.cliente,
      row.nome_legal,
      row.endereco,
      row.nif
    ].map(norm).some((value) => value.includes(query));
  }

  function summaryCounts(rows) {
    return {
      total: rows.length,
      legalFilled: rows.filter((row) => isFilled(row.nome_legal)).length,
      addressFilled: rows.filter((row) => isFilled(row.endereco)).length,
      nifFilled: rows.filter((row) => isFilled(row.nif)).length
    };
  }

  function renderSummary(rows) {
    if (!els.clientsSummary) return;
    const counts = summaryCounts(rows);
    els.clientsSummary.innerHTML = [
      ["Total de clientes", counts.total],
      ["Nomes legais", counts.legalFilled],
      ["Moradas", counts.addressFilled],
      ["NIFs", counts.nifFilled]
    ]
      .map(
        ([label, value]) => `
          <article class="client-stat">
            <span>${esc(label)}</span>
            <strong>${esc(value)}</strong>
          </article>
        `
      )
      .join("");
  }

  function renderTable(rows) {
    if (!els.clientsBody) return;
    if (!rows.length) {
      els.clientsBody.innerHTML = "";
      return;
    }

    els.clientsBody.innerHTML = rows
      .map(
        (row) => `
          <tr class="client-row">
            <td>
              <div class="client-stack">
                <strong>${esc(row.cliente || "—")}</strong>
              </div>
            </td>
            <td>
              <div class="client-stack">
                <strong>${esc(row.nome_legal || "—")}</strong>
              </div>
            </td>
            <td>
              <div class="client-stack">
                <strong>${esc(row.endereco || "—")}</strong>
              </div>
            </td>
            <td>
              <span class="client-chip client-chip-neutral">${esc(row.nif || "—")}</span>
            </td>
          </tr>
        `
      )
      .join("");
  }

  function renderCards(rows) {
    if (!els.clientsCards) return;
    if (!rows.length) {
      els.clientsCards.innerHTML = "";
      return;
    }

    els.clientsCards.innerHTML = rows
      .map(
        (row) => `
          <article class="client-card">
            <div class="client-card-head">
              <span class="client-avatar">${esc(String(row.cliente || "?").slice(0, 2).toUpperCase())}</span>
              <span class="client-main">
                <strong>${esc(row.cliente || "—")}</strong>
                <small>${esc(row.nome_legal || "—")}</small>
              </span>
            </div>
            <div class="client-card-grid">
              <div>
                <span>Nome legal</span>
                <strong>${esc(row.nome_legal || "—")}</strong>
              </div>
              <div>
                <span>NIF</span>
                <strong>${esc(row.nif || "—")}</strong>
              </div>
              <div class="client-card-grid-wide">
                <span>Endereço</span>
                <strong>${esc(row.endereco || "—")}</strong>
              </div>
            </div>
          </article>
        `
      )
      .join("");
  }

  function render() {
    const filtered = sortRows(state.rows.filter(matchesSearch));
    state.filtered = filtered;

    if (els.clientsRangeInfo) {
      els.clientsRangeInfo.textContent = `${filtered.length} registos`;
    }

    if (els.clientsEmpty) {
      els.clientsEmpty.hidden = filtered.length > 0;
    }

    if (els.clientsTableWrap) {
      els.clientsTableWrap.hidden = filtered.length === 0;
    }

    if (els.clientsCards) {
      els.clientsCards.hidden = filtered.length === 0;
    }

    renderSummary(state.rows);
    renderTable(filtered);
    renderCards(filtered);
  }

  function bindEvents() {
    if (els.clientsSearch) {
      els.clientsSearch.addEventListener("input", render);
    }

    if (els.clientsSortMode) {
      els.clientsSortMode.addEventListener("change", () => {
        state.sortMode = String(els.clientsSortMode.value || "name-asc");
        render();
      });
    }
  }

  async function bootstrap() {
    const session = await window.CRMAuth.ensureAuth();
    if (!session) return;

    window.CRMAuth.bindLogout();

    if (els.sessionInfo) {
      const label = session.user ? session.user.name || session.user.email || "" : "";
      els.sessionInfo.textContent = label ? `Sessão ativa: ${label}` : "";
    }

    bindEvents();
    state.rows = getSeedRows();
    render();
  }

  bootstrap();
})();
