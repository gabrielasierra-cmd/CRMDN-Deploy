(function () {
  const form = document.getElementById("publicServiceRequestForm");
  const feedback = document.getElementById("publicRequestFeedback");
  const logoutBtn = document.getElementById("logoutBtn");

  const show = (msg, ok = true) => {
    feedback.textContent = msg;
    feedback.className = "feedback " + (ok ? "ok" : "err");
  };

  const bindLogout = () => {
    if (!logoutBtn || !window.CRMApi) return;

    const session = window.CRMApi.getAuth ? window.CRMApi.getAuth() : null;
    if (!session || !session.accessToken) {
      logoutBtn.hidden = true;
      return;
    }

    logoutBtn.hidden = false;
    logoutBtn.addEventListener("click", async () => {
      logoutBtn.disabled = true;
      try {
        await window.CRMApi.logout();
      } catch (_error) {
        // Ignore network issues and redirect anyway.
      } finally {
        window.CRMApi.clearAuth();
        location.href = "index.html";
      }
    });
  };

  function dateToISO(dateValue, shift) {
    const day = String(dateValue || "").slice(0, 10);
    if (!day) return "";
    const hh = shift === "tarde" ? "14:00" : shift === "noite" ? "19:00" : "09:00";
    return `${day}T${hh}`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("reqName").value.trim();
    const phone = document.getElementById("reqPhone").value.trim();
    const email = document.getElementById("reqEmail").value.trim().toLowerCase();
    const type = document.getElementById("reqType").value;
    const address = document.getElementById("reqAddress").value.trim();
    const preferredDate = document.getElementById("reqDate").value;
    const preferredShift = document.getElementById("reqShift").value;
    const notes = document.getElementById("reqNotes").value.trim();

    if (!name || !phone || !address || !preferredDate) {
      show("Preencha os campos obrigatórios.", false);
      return;
    }

    const requests = CRM.read(CRM.K.serviceRequests, []);
    requests.push({
      id: CRM.uid(),
      name,
      phone,
      email,
      address,
      type,
      preferredDate,
      preferredShift,
      preferredStartAt: dateToISO(preferredDate, preferredShift),
      notes,
      status: "novo",
      createdAt: new Date().toISOString()
    });
    CRM.write(CRM.K.serviceRequests, requests);
    form.reset();
    show("Pedido enviado com sucesso. Vamos entrar em contacto.");
  });

  bindLogout();
})();
