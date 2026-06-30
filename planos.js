(function () {
  CRMAuth.requireAuth();
  CRM.ensureTeams();
  CRMAuth.bindLogout();

  const feedback = document.getElementById("mainFeedback");
  const planSearch = document.getElementById("planSearch");
  const planFilterFrequency = document.getElementById("planFilterFrequency");
  const planFilterType = document.getElementById("planFilterType");

  const show = (msg, ok = true) => {
    feedback.textContent = msg;
    feedback.className = "feedback " + (ok ? "ok" : "err");
  };

  function toLabel(value) {
    const map = {
      semanal: "Semanal",
      quinzenal: "Quinzenal",
      mensal: "Mensal",
      residencial: "Residencial",
      comercial: "Comercial",
      pos_obra: "Pós-obra"
    };
    return map[value] || value || "-";
  }

  function getFilteredPlans(plans) {
    const q = (planSearch.value || "").trim().toLowerCase();
    const frequency = planFilterFrequency.value;
    const type = planFilterType.value;

    return plans.filter((p) => {
      if (q && !String(p.name || "").toLowerCase().includes(q)) return false;
      if (frequency && p.frequency !== frequency) return false;
      if (type && p.type !== type) return false;
      return true;
    });
  }

  function renderKpis(plans) {
    const total = plans.length;
    const avg = total ? plans.reduce((acc, p) => acc + (+p.basePrice || 0), 0) / total : 0;
    const max = total ? Math.max(...plans.map((p) => +p.basePrice || 0)) : 0;

    const frequencyCounts = plans.reduce((acc, p) => {
      const k = p.frequency || "";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const topFrequencyKey = Object.keys(frequencyCounts).sort((a, b) => frequencyCounts[b] - frequencyCounts[a])[0] || "";

    document.getElementById("plansTotal").textContent = String(total);
    document.getElementById("plansAvgPrice").textContent = CRM.money(avg);
    document.getElementById("plansTopFrequency").textContent = topFrequencyKey ? toLabel(topFrequencyKey) : "-";
    document.getElementById("plansMaxPrice").textContent = CRM.money(max);
  }

  function renderTable(plans) {
    const rows = plans.map((p) => `
      <tr>
        <td><strong>${p.name || "-"}</strong></td>
        <td><span class="plans-tag">${toLabel(p.frequency)}</span></td>
        <td>${toLabel(p.type)}</td>
        <td>${CRM.money(+p.basePrice || 0)}</td>
        <td>
          <button class="secondary plan-delete-btn" data-id="${p.id}" type="button">Eliminar</button>
        </td>
      </tr>
    `).join("");

    document.getElementById("plansBody").innerHTML = rows || "<tr><td colspan='5'>Sem planos para os filtros atuais.</td></tr>";
  }

  function render() {
    const plans = CRM.read(CRM.K.plans);
    const filtered = getFilteredPlans(plans);
    renderKpis(plans);
    renderTable(filtered);
  }

  document.getElementById("planForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("pName").value.trim();
    const basePrice = +document.getElementById("pPrice").value;
    if (!name) return show("Nome do plano é obrigatório.", false);
    if (!Number.isFinite(basePrice) || basePrice < 0) return show("Preço base inválido.", false);

    const plans = CRM.read(CRM.K.plans);
    plans.push({
      id: CRM.uid(),
      name,
      frequency: document.getElementById("pFrequency").value,
      type: document.getElementById("pType").value,
      basePrice
    });
    CRM.write(CRM.K.plans, plans);
    e.target.reset();
    render();
    show("Plano criado.");
  });

  [planSearch, planFilterFrequency, planFilterType].forEach((el) => {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  document.body.addEventListener("click", (e) => {
    const delBtn = e.target.closest(".plan-delete-btn");
    if (!delBtn) return;

    const id = delBtn.dataset.id;
    const plans = CRM.read(CRM.K.plans);
    const target = plans.find((p) => p.id === id);
    if (!target) return;
    if (!window.confirm(`Eliminar o plano "${target.name}"?`)) return;

    CRM.write(CRM.K.plans, plans.filter((p) => p.id !== id));
    render();
    show("Plano eliminado.");
  });

  render();
  window.addEventListener("crm:remote-sync", render);
})();
