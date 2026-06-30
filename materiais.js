(async function () {
  const session = await window.CRMAuth.ensureAuth();
  if (!session) return;
  window.CRMAuth.bindLogout();

  const MATERIALS_KEY = CRM.K.materials || "materials";
  const MOVES_KEY = CRM.K.materialMoves || "material_moves";
  const CATEGORIES = [
    "Produtos de limpeza",
    "Materiais descartáveis",
    "Equipamentos",
    "EPIs"
  ];

  const els = {
    feedback: document.getElementById("mainFeedback"),
    materialForm: document.getElementById("materialForm"),
    movementForm: document.getElementById("movementForm"),
    mCategory: document.getElementById("mCategory"),
    mName: document.getElementById("mName"),
    mUnit: document.getElementById("mUnit"),
    mStock: document.getElementById("mStock"),
    mMin: document.getElementById("mMin"),
    mUse: document.getElementById("mUse"),
    moveMaterial: document.getElementById("moveMaterial"),
    moveType: document.getElementById("moveType"),
    moveQty: document.getElementById("moveQty"),
    moveDate: document.getElementById("moveDate"),
    moveNote: document.getElementById("moveNote"),
    categoryFilter: document.getElementById("categoryFilter"),
    statusFilter: document.getElementById("statusFilter"),
    searchFilter: document.getElementById("searchFilter"),
    refreshBtn: document.getElementById("refreshBtn"),
    materialsGroups: document.getElementById("materialsGroups"),
    movesBody: document.getElementById("movesBody"),
    statProducts: document.getElementById("statProducts"),
    statStock: document.getElementById("statStock"),
    statLowStock: document.getElementById("statLowStock"),
    statFlow: document.getElementById("statFlow")
  };

  let materials = [];
  let moves = [];

  function show(message, ok = true) {
    if (!els.feedback) return;
    els.feedback.textContent = message;
    els.feedback.className = "feedback " + (ok ? "ok" : "err");
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
    return Number.isFinite(n) ? +n.toFixed(2) : 0;
  }

  function todayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function normalizeCategory(value, fallbackName = "") {
    const raw = String(value || "").trim().toLowerCase();
    const inferred = inferCategory(fallbackName);
    const map = {
      "produtos de limpeza": "Produtos de limpeza",
      "produtos limpeza": "Produtos de limpeza",
      "limpeza": "Produtos de limpeza",
      "materiais descartaveis": "Materiais descartáveis",
      "descartaveis": "Materiais descartáveis",
      "equipamentos": "Equipamentos",
      "epis": "EPIs"
    };
    return map[raw] || inferred;
  }

  function inferCategory(name) {
    const raw = String(name || "").toLowerCase();
    if (/(luva|mascara|máscara|oculos|óculos|bota|farda|epi|protec|protec|capuz)/.test(raw)) {
      return "EPIs";
    }
    if (/(saco|guardanapo|papel|toalha|descart|copo|prato|frasco|rolo)/.test(raw)) {
      return "Materiais descartáveis";
    }
    if (/(aspir|mopa|esfreg|vass|balde|carro|maquina|máquina|equip)/.test(raw)) {
      return "Equipamentos";
    }
    return "Produtos de limpeza";
  }

  function normalizeMaterial(item) {
    const name = String(item.name || "").trim();
    const category = normalizeCategory(item.category, name);
    return {
      id: String(item.id || CRM.uid()),
      name,
      category,
      unit: String(item.unit || item.measure || "un").trim() || "un",
      stock: parseNumber(item.stock ?? item.currentStock ?? 0),
      minStock: parseNumber(item.minStock ?? item.min_stock ?? 0),
      monthlyUse: parseNumber(item.monthlyUse ?? item.consumoMensal ?? 0)
    };
  }

  function normalizeMove(move) {
    const date = String(move.date || move.at || todayISO()).slice(0, 10);
    return {
      id: String(move.id || CRM.uid()),
      materialId: String(move.materialId || ""),
      type: String(move.type || "in").toLowerCase() === "out" ? "out" : "in",
      qty: parseNumber(move.qty ?? move.quantity ?? 0),
      date,
      note: String(move.note || move.notes || "").trim(),
      createdAt: move.createdAt || move.at || new Date(`${date}T12:00:00.000Z`).toISOString()
    };
  }

  function materialNeedsRewrite(item) {
    return !item || !item.category || item.stock === undefined || item.minStock === undefined || item.monthlyUse === undefined;
  }

  function moveNeedsRewrite(item) {
    return !item || !item.date || item.qty === undefined || !item.createdAt;
  }

  function readMaterials() {
    return CRM.read(MATERIALS_KEY, []).map(normalizeMaterial);
  }

  function writeMaterials(next) {
    CRM.write(MATERIALS_KEY, next);
  }

  function readMoves() {
    return CRM.read(MOVES_KEY, []).map(normalizeMove);
  }

  function writeMoves(next) {
    CRM.write(MOVES_KEY, next);
  }

  function seedMaterials() {
    const current = CRM.read(MATERIALS_KEY, []);
    if (current.length) return;

    writeMaterials([
      { id: CRM.uid(), name: "Detergente multiusos", category: "Produtos de limpeza", unit: "l", stock: 24, minStock: 10, monthlyUse: 18 },
      { id: CRM.uid(), name: "Desinfetante", category: "Produtos de limpeza", unit: "l", stock: 18, minStock: 8, monthlyUse: 14 },
      { id: CRM.uid(), name: "Panos microfibra", category: "Materiais descartáveis", unit: "un", stock: 42, minStock: 20, monthlyUse: 24 },
      { id: CRM.uid(), name: "Sacos do lixo", category: "Materiais descartáveis", unit: "pack", stock: 30, minStock: 12, monthlyUse: 16 },
      { id: CRM.uid(), name: "Mopa profissional", category: "Equipamentos", unit: "un", stock: 6, minStock: 2, monthlyUse: 2 },
      { id: CRM.uid(), name: "Luvas nitrilo", category: "EPIs", unit: "caixa", stock: 14, minStock: 6, monthlyUse: 8 }
    ]);
  }

  function normalizeSeededData() {
    const current = CRM.read(MATERIALS_KEY, []);
    if (current.some(materialNeedsRewrite)) {
      writeMaterials(current.map(normalizeMaterial));
    }

    const moveCurrent = CRM.read(MOVES_KEY, []);
    if (moveCurrent.some(moveNeedsRewrite)) {
      writeMoves(moveCurrent.map(normalizeMove));
    }
  }

  function categoryName(value) {
    return CATEGORIES.includes(value) ? value : "Produtos de limpeza";
  }

  function movementTotalsByMaterial() {
    return moves.reduce((acc, move) => {
      const entry = acc.get(move.materialId) || { in: 0, out: 0 };
      if (move.type === "out") entry.out += move.qty;
      else entry.in += move.qty;
      acc.set(move.materialId, entry);
      return acc;
    }, new Map());
  }

  function getFilteredMaterials() {
    const category = els.categoryFilter ? els.categoryFilter.value : "";
    const status = els.statusFilter ? els.statusFilter.value : "all";
    const search = String(els.searchFilter?.value || "").trim().toLowerCase();

    return materials
      .filter((item) => !category || item.category === category)
      .filter((item) => {
        if (!search) return true;
        const target = `${item.name} ${item.category} ${item.unit}`.toLowerCase();
        return target.includes(search);
      })
      .filter((item) => {
        const isCritical = item.stock <= item.minStock;
        const isAttention = item.stock > item.minStock && item.stock <= item.minStock * 1.5;
        if (status === "critical") return isCritical;
        if (status === "attention") return isAttention;
        if (status === "normal") return !isCritical && !isAttention;
        return true;
      })
      .sort((a, b) => a.category.localeCompare(b.category, "pt") || a.name.localeCompare(b.name, "pt"));
  }

  function materialStatus(item) {
    if (item.stock <= item.minStock) return "critical";
    if (item.stock <= item.minStock * 1.5) return "attention";
    return "normal";
  }

  function statusLabel(status) {
    if (status === "critical") return "Abaixo";
    if (status === "attention") return "Quase";
    return "OK";
  }

  function updateMaterialOptions() {
    const selectedMaterialId = els.moveMaterial ? els.moveMaterial.value : "";
    const selectedCategory = els.categoryFilter ? els.categoryFilter.value : "";
    const selectedStatus = els.statusFilter ? els.statusFilter.value : "all";
    const selectedFormCategory = els.mCategory ? els.mCategory.value : "";

    const options = materials
      .slice()
      .sort((a, b) => a.category.localeCompare(b.category, "pt") || a.name.localeCompare(b.name, "pt"))
      .map((item) => `<option value="${esc(item.id)}">${esc(item.category)} - ${esc(item.name)}</option>`)
      .join("");
    if (els.moveMaterial) els.moveMaterial.innerHTML = options;

    const categoryOptions = [`<option value="">Todas as categorias</option>`]
      .concat(CATEGORIES.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`))
      .join("");
    if (els.categoryFilter) {
      els.categoryFilter.innerHTML = categoryOptions;
      els.categoryFilter.value = selectedCategory;
    }
    if (els.statusFilter) {
      els.statusFilter.value = selectedStatus;
    }
    if (els.mCategory) {
      els.mCategory.innerHTML = CATEGORIES.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join("");
      els.mCategory.value = selectedFormCategory || CATEGORIES[0];
    }

    if (els.moveMaterial) {
      els.moveMaterial.innerHTML = options;
      if (selectedMaterialId && materials.some((item) => item.id === selectedMaterialId)) {
        els.moveMaterial.value = selectedMaterialId;
      } else if (materials.length) {
        els.moveMaterial.value = materials[0].id;
      }
    }
  }

  function renderSummary() {
    const totals = movementTotalsByMaterial();
    const totalProducts = materials.length;
    const totalStock = materials.reduce((sum, item) => sum + item.stock, 0);
    const lowStock = materials.filter((item) => item.stock <= item.minStock).length;
    const totalIn = [...totals.values()].reduce((sum, entry) => sum + entry.in, 0);
    const totalOut = [...totals.values()].reduce((sum, entry) => sum + entry.out, 0);

    if (els.statProducts) els.statProducts.textContent = String(totalProducts);
    if (els.statStock) els.statStock.textContent = totalStock.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    if (els.statLowStock) els.statLowStock.textContent = String(lowStock);
    if (els.statFlow) els.statFlow.textContent = `${totalIn.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} / ${totalOut.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  function renderMaterialsGroups() {
    if (!els.materialsGroups) return;
    const filtered = getFilteredMaterials();
    const totals = movementTotalsByMaterial();
    const grouped = CATEGORIES.map((category) => ({
      category,
      items: filtered.filter((item) => item.category === category)
    }));

    els.materialsGroups.innerHTML = grouped.map(({ category, items }) => {
      const categoryItems = items.length ? items : [];
      const categoryTotal = categoryItems.reduce((sum, item) => sum + item.stock, 0);
      const categoryLow = categoryItems.filter((item) => item.stock <= item.minStock).length;

      const rows = categoryItems.length
        ? categoryItems.map((item) => {
            const movement = totals.get(item.id) || { in: 0, out: 0 };
            const status = materialStatus(item);
            return `
              <tr class="material-row material-${status}">
                <td>
                  <div class="material-name-cell">
                    <strong>${esc(item.name)}</strong>
                    <span>${esc(item.unit)}</span>
                  </div>
                </td>
                <td class="num-col">${esc(item.stock.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}</td>
                <td class="num-col">${esc(item.minStock.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}</td>
                <td class="num-col">${esc(movement.in.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}</td>
                <td class="num-col">${esc(movement.out.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}</td>
                <td><span class="status-badge ${status}">${statusLabel(status)}</span></td>
                <td>
                  <button type="button" class="secondary move-btn" data-action="pick" data-id="${esc(item.id)}">Registar</button>
                </td>
              </tr>
            `;
          }).join("")
        : `<tr><td colspan="7" class="muted" style="padding:12px">Sem produtos nesta categoria.</td></tr>`;

      return `
        <article class="materials-category-card">
          <div class="materials-category-head">
            <div>
              <h4>${esc(category)}</h4>
              <div class="muted">${categoryItems.length} produto(s) | Stock total ${esc(categoryTotal.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 2 }))} | ${categoryLow} abaixo do minimo</div>
            </div>
          </div>
          <div class="materials-table-wrap">
            <table class="materials-group-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th class="num-col">Atual</th>
                  <th class="num-col">Minimo</th>
                  <th class="num-col">Entradas</th>
                  <th class="num-col">Saidas</th>
                  <th>Estado</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderMovesLog() {
    if (!els.movesBody) return;
    const materialMap = Object.fromEntries(materials.map((item) => [item.id, item]));
    const recentMoves = moves
      .slice()
      .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))
      .slice(0, 12);

    els.movesBody.innerHTML = recentMoves.length
      ? recentMoves.map((move) => {
          const material = materialMap[move.materialId];
          return `
            <tr>
              <td>${esc(new Date(move.date).toLocaleDateString("pt-PT"))}</td>
              <td>${esc(material?.category || "-")}</td>
              <td>${esc(material?.name || "-")}</td>
              <td><span class="status-badge ${move.type === "out" ? "out" : "in"}">${move.type === "out" ? "Saida" : "Entrada"}</span></td>
              <td class="num-col">${esc(move.qty.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}</td>
              <td>${esc(move.note || "-")}</td>
            </tr>
          `;
        }).join("")
      : "<tr><td colspan='6' class='muted' style='padding:12px'>Sem movimentos registados.</td></tr>";
  }

  function pickMaterial(materialId) {
    if (!els.moveMaterial) return;
    els.moveMaterial.value = materialId;
    if (els.moveQty) els.moveQty.focus();
  }

  function refreshView() {
    materials = readMaterials().map(normalizeMaterial);
    moves = readMoves().map(normalizeMove);

    updateMaterialOptions();
    renderSummary();
    renderMaterialsGroups();
    renderMovesLog();
  }

  function ensureStorage() {
    seedMaterials();
    normalizeSeededData();
    materials = readMaterials().map(normalizeMaterial);
    moves = readMoves().map(normalizeMove);
    if (!els.moveDate) return;
    els.moveDate.value = todayISO();
  }

  if (els.materialForm) {
    els.materialForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const name = String(els.mName.value || "").trim();
      const category = categoryName(els.mCategory.value);
      const stock = parseNumber(els.mStock.value);
      const minStock = parseNumber(els.mMin.value);
      const monthlyUse = parseNumber(els.mUse.value);
      const unit = String(els.mUnit.value || "").trim() || "un";

      if (!name) {
        show("O nome do produto e obrigatorio.", false);
        return;
      }

      const duplicate = materials.some((item) => item.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        show("Esse produto já existe. Se quiseres, posso acrescentar um modo de edição depois.", false);
        return;
      }

      materials.push({
        id: CRM.uid(),
        name,
        category,
        unit,
        stock,
        minStock,
        monthlyUse
      });

      writeMaterials(materials);
      event.target.reset();
      if (els.mCategory) els.mCategory.value = CATEGORIES[0];
      show("Produto guardado com sucesso.", true);
      refreshView();
    });
  }

  if (els.movementForm) {
    els.movementForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const materialId = els.moveMaterial.value;
      const type = els.moveType.value === "out" ? "out" : "in";
      const qty = parseNumber(els.moveQty.value);
      const date = String(els.moveDate.value || "").trim();
      const note = String(els.moveNote.value || "").trim();

      if (!materialId || !date || !qty || qty <= 0) {
        show("Produto, quantidade e data são obrigatórios.", false);
        return;
      }

      const material = materials.find((item) => item.id === materialId);
      if (!material) {
        show("Produto nao encontrado.", false);
        return;
      }

      if (type === "out" && material.stock < qty) {
        show("Stock insuficiente para essa saída.", false);
        return;
      }

      material.stock = type === "in"
        ? +(material.stock + qty).toFixed(2)
        : +(material.stock - qty).toFixed(2);

      moves.push({
        id: CRM.uid(),
        materialId,
        type,
        qty,
        date,
        note,
        createdAt: new Date(`${date}T12:00:00.000Z`).toISOString()
      });

      writeMaterials(materials);
      writeMoves(moves);

      const selectedMaterial = materialId;
      const selectedType = els.moveType.value;
      event.target.reset();
      els.moveMaterial.value = selectedMaterial;
      els.moveType.value = selectedType;
      els.moveDate.value = date;
      show("Movimento registado com sucesso.", true);
      refreshView();
    });
  }

  if (els.refreshBtn) {
    els.refreshBtn.addEventListener("click", () => {
      refreshView();
      show("Vista de materiais atualizada.", true);
    });
  }

  if (els.categoryFilter) {
    els.categoryFilter.addEventListener("change", refreshView);
  }

  if (els.statusFilter) {
    els.statusFilter.addEventListener("change", refreshView);
  }

  if (els.searchFilter) {
    els.searchFilter.addEventListener("input", () => {
      clearTimeout(els.searchFilter._timer);
      els.searchFilter._timer = setTimeout(refreshView, 250);
    });
  }

  if (els.materialsGroups) {
    els.materialsGroups.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='pick']");
      if (!button) return;
      pickMaterial(button.dataset.id);
    });
  }

  ensureStorage();
  refreshView();
  window.addEventListener("crm:remote-sync", refreshView);
})();
