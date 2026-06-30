(async function () {
  const session = await CRMAuth.ensureAuth();
  if (!session) return;
  CRM.ensureTeams();
  CRM.ensureEmployees();
  CRMAuth.bindLogout();

  const feedback = document.getElementById("mainFeedback");
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let selectedDateISO = "";
  const el = {
    vacationForm: document.getElementById("vacationForm"),
    extraForm: document.getElementById("extraForm"),
    employeeForm: document.getElementById("employeeForm"),
    vEmployee: document.getElementById("vEmployee"),
    vDate: document.getElementById("vDate"),
    vShift: document.getElementById("vShift"),
    vNote: document.getElementById("vNote"),
    xDate: document.getElementById("xDate"),
    xEmployee: document.getElementById("xEmployee"),
    xHours: document.getElementById("xHours"),
    xLocation: document.getElementById("xLocation"),
    xNote: document.getElementById("xNote"),
    eName: document.getElementById("eName"),
    eShift: document.getElementById("eShift"),
    eDays: document.getElementById("eDays"),
    eOff: document.getElementById("eOff"),
    eLocations: document.getElementById("eLocations"),
    employeesBody: document.getElementById("employeesBody"),
    toast: document.getElementById("toast"),
    extrasTableSection: document.getElementById("extrasTableSection"),
    extrasTableTitle: document.getElementById("extrasTableTitle"),
    extrasTableBody: document.getElementById("extrasTableBody"),
    vacationsTableTitle: document.getElementById("vacationsTableTitle"),
    vacationsTableBody: document.getElementById("vacationsTableBody"),
    kpiVacations: document.getElementById("kpiVacations"),
    kpiExtrasCount: document.getElementById("kpiExtrasCount"),
    kpiExtrasHours: document.getElementById("kpiExtrasHours"),
    kpiTop: document.getElementById("kpiTop"),
    extrasCalendar: document.getElementById("extrasCalendar"),
    calendarTitle: document.getElementById("calendarTitle"),
    prevMonthBtn: document.getElementById("prevMonthBtn"),
    nextMonthBtn: document.getElementById("nextMonthBtn")
  };

  function show(msg, ok) {
    feedback.textContent = msg;
    feedback.className = "feedback " + (ok ? "ok" : "err");
  }

  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  function clearShow() {
    feedback.textContent = "";
    feedback.className = "feedback";
  }

  function toISO(dateValue) {
    const d = new Date(dateValue);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function extraStats(extras, employeeMap) {
    const hours = extras.reduce((sum, x) => sum + (+x.hours || 0), 0);
    const perPerson = {};
    extras.forEach((x) => {
      const key = employeeMap[x.employeeId]?.name || "-";
      perPerson[key] = (perPerson[key] || 0) + (+x.hours || 0);
    });
    const top = Object.entries(perPerson).sort((a, b) => b[1] - a[1])[0] || null;

    return { count: extras.length, hours, top };
  }

  function renderEmployees() {
    const employees = CRM.read(CRM.K.employees);
    const options = employees
      .map((emp) => '<option value="' + emp.id + '">' + emp.name + "</option>")
      .join("");
    el.vEmployee.innerHTML = options;
    el.xEmployee.innerHTML = options;

    if (!employees.length) {
      el.employeesBody.innerHTML = "<tr><td colspan='5'>Sem funcionários registados.</td></tr>";
      return;
    }

    const chips = (list, className) => {
      if (!list || !list.length) return "<span class='leave-empty'>-</span>";
      return "<div class='leave-chips'>" + list.map((x) => `<span class="leave-chip ${className || ""}">${x}</span>`).join("") + "</div>";
    };

    el.employeesBody.innerHTML = employees
      .map((emp) => {
        const days = chips(emp.workDays || [], "days");
        const shift = emp.defaultShift || "-";
        const off = emp.offPolicy || "-";
        const locations = chips(emp.locations || [], "locations");
        return (
          "<tr>" +
            "<td>" + emp.name + "</td>" +
            "<td>" + days + "</td>" +
            "<td>" + shift + "</td>" +
            "<td>" + off + "</td>" +
            "<td>" + locations + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderVacationsTable(employeeMap) {
    if (!el.vacationsTableBody) return;
    const vacations = CRM.read(CRM.K.vacations).sort((a, b) => new Date(b.date) - new Date(a.date));
    const extras = CRM.read(CRM.K.extraShifts);
    const extrasSet = new Set(extras.map((x) => `${x.employeeId}|${x.date}`));

    if (el.vacationsTableTitle) {
      el.vacationsTableTitle.textContent = "Resumo das folgas registadas.";
    }

    if (!vacations.length) {
      el.vacationsTableBody.innerHTML = "<tr><td colspan='5'>Sem folgas registadas.</td></tr>";
      return;
    }

    el.vacationsTableBody.innerHTML = vacations.map((v) => {
      const name = employeeMap[v.employeeId]?.name || "Funcionário";
      const date = v.date ? new Date(v.date).toLocaleDateString("pt-PT") : "-";
      const shift = v.shift || "-";
      const note = v.note || "-";
      const conflict = extrasSet.has(`${v.employeeId}|${v.date}`);
      const status = conflict
        ? '<span class="leave-tag warn">Conflito</span>'
        : '<span class="leave-tag ok">Ok</span>';
      return (
        "<tr class='" + (conflict ? "is-conflict" : "") + "'>" +
          "<td>" + date + "</td>" +
          "<td>" + name + "</td>" +
          "<td>" + shift + "</td>" +
          "<td>" + note + "</td>" +
          "<td>" + status + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function renderTopKpis(employeeMap) {
    if (!el.kpiVacations || !el.kpiExtrasCount || !el.kpiExtrasHours || !el.kpiTop) return;
    const vacations = CRM.read(CRM.K.vacations);
    const extras = CRM.read(CRM.K.extraShifts);
    const stats = extraStats(extras, employeeMap);

    el.kpiVacations.textContent = String(vacations.length);
    el.kpiExtrasCount.textContent = String(stats.count);
    el.kpiExtrasHours.textContent = stats.hours.toFixed(1) + "h";
    el.kpiTop.textContent = stats.top ? stats.top[0] : "-";
  }

  function renderExtrasTable(employeeMap, filterDate) {
    if (!el.extrasTableBody || !el.extrasTableTitle) return;
    const extras = CRM.read(CRM.K.extraShifts).sort((a, b) => new Date(b.date) - new Date(a.date));
    const vacations = CRM.read(CRM.K.vacations);
    const vacationsSet = new Set(vacations.map((v) => `${v.employeeId}|${v.date}`));

    const list = filterDate ? extras.filter((x) => x.date === filterDate) : extras;

    if (el.extrasTableTitle) {
      if (filterDate) {
        el.extrasTableTitle.textContent = `Extras do dia ${new Date(filterDate).toLocaleDateString("pt-PT")}.`;
      } else {
        el.extrasTableTitle.textContent = "Todos os registos de extras.";
      }
    }

    if (!list.length) {
      el.extrasTableBody.innerHTML = `<tr><td colspan="6">${filterDate ? "Sem extras para esta data." : "Sem extras registados."}</td></tr>`;
      return;
    }

    el.extrasTableBody.innerHTML = list.map((x) => {
      const name = employeeMap[x.employeeId]?.name || x.employeeName || "Funcionário";
      const date = x.date ? new Date(x.date).toLocaleDateString("pt-PT") : "-";
      const hours = (+x.hours || 0).toFixed(1) + "h";
      const location = x.location || "-";
      const note = x.note || "-";
      const conflict = vacationsSet.has(`${x.employeeId}|${x.date}`);
      const status = conflict
        ? '<span class="leave-tag warn">Conflito</span>'
        : '<span class="leave-tag extra">Extra</span>';
      return (
        "<tr class='" + (conflict ? "is-conflict" : "is-extra") + "'>" +
          "<td>" + date + "</td>" +
          "<td>" + name + "</td>" +
          "<td>" + hours + "</td>" +
          "<td>" + location + "</td>" +
          "<td>" + note + "</td>" +
          "<td>" + status + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function renderCalendar() {
    if (!el.extrasCalendar || !el.calendarTitle) return;
    const extras = CRM.read(CRM.K.extraShifts);
    el.calendarTitle.textContent = monthNames[currentMonth] + " " + currentYear;

    const first = new Date(currentYear, currentMonth, 1);
    const firstWeekday = first.getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();
    const cells = [];

    weekdays.forEach((w) => cells.push('<div class="cal-head">' + w + "</div>"));

    for (let i = 0; i < firstWeekday; i += 1) {
      const day = prevMonthDays - firstWeekday + i + 1;
      cells.push('<div class="cal-day muted-day"><div class="cal-num">' + day + "</div></div>");
    }

    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = new Date(currentYear, currentMonth, d);
      const iso = toISO(date);
      const extraCount = extras.filter((x) => x.date === iso).length;
      const today = iso === toISO(new Date());
      const selected = iso === selectedDateISO;
      const classNames = ["cal-day"];
      if (today) classNames.push("today");
      if (selected) classNames.push("selected");

      cells.push(
        '<button class="' + classNames.join(" ") + '" type="button" data-date="' + iso + '">' +
          '<div class="cal-num">' + d + "</div>" +
          (extraCount ? '<span class="cal-badge">' + extraCount + " extra</span>" : "") +
        "</button>"
      );
    }

    el.extrasCalendar.innerHTML = cells.join("");
    const dateNodes = el.extrasCalendar.querySelectorAll("[data-date]");
    dateNodes.forEach((node) => {
      node.addEventListener("click", () => {
        selectedDateISO = node.dataset.date;
        el.xDate.value = selectedDateISO;
        const employeeMap = CRM.getMap(CRM.K.employees);
        renderExtrasTable(employeeMap, selectedDateISO);
        renderCalendar();
      });
    });
  }

  function refreshAll() {
    const employeeMap = CRM.getMap(CRM.K.employees);
    renderEmployees();
    renderTopKpis(employeeMap);
    renderExtrasTable(employeeMap, selectedDateISO || "");
    renderVacationsTable(employeeMap);
    renderCalendar();
  }

  el.vacationForm.addEventListener("submit", (ev) => {
    ev.preventDefault();

    const employeeId = el.vEmployee.value;
    const date = el.vDate.value;
    if (!employeeId || !date) {
      show("Funcionário e data são obrigatórios.", false);
      return;
    }

    const vacations = CRM.read(CRM.K.vacations);
    vacations.push({
      id: CRM.uid(),
      employeeId: employeeId,
      date: date,
      shift: el.vShift.value.trim(),
      note: el.vNote.value.trim(),
      createdAt: Date.now()
    });

    CRM.write(CRM.K.vacations, vacations);
    el.vacationForm.reset();
    refreshAll();
    show("Folga registada com sucesso.", true);
    toast("Folga guardada com sucesso.");
  });

  el.extraForm.addEventListener("submit", (ev) => {
    ev.preventDefault();

    const date = el.xDate.value;
    const hours = +el.xHours.value;
    const employeeId = el.xEmployee.value;
    if (!date || !employeeId || !hours || hours <= 0) {
      show("Data, funcionário e horas extra válidas são obrigatórios.", false);
      return;
    }

    const extras = CRM.read(CRM.K.extraShifts);
    extras.push({
      id: CRM.uid(),
      employeeId: employeeId,
      employeeName: (CRM.getMap(CRM.K.employees)[employeeId]?.name || ""),
      date: date,
      hours: +hours.toFixed(1),
      location: el.xLocation.value.trim(),
      note: el.xNote.value.trim(),
      createdAt: Date.now()
    });

    CRM.write(CRM.K.extraShifts, extras);
    selectedDateISO = date;
    el.extraForm.reset();
    el.xDate.value = date;
    refreshAll();
    show("Extra registado com sucesso.", true);
    toast("Extra associado ao funcionário com sucesso.");
  });

  el.employeeForm.addEventListener("submit", (ev) => {
    ev.preventDefault();

    const name = el.eName.value.trim();
    if (!name) {
      show("Nome do funcionário é obrigatório.", false);
      return;
    }

    const employees = CRM.read(CRM.K.employees);
    const alreadyExists = employees.some((e) => String(e.name || "").trim().toLowerCase() === name.toLowerCase());
    if (alreadyExists) {
      show("Esse funcionário já existe.", false);
      return;
    }

    employees.push({
      id: CRM.uid(),
      name: name,
      defaultShift: el.eShift.value.trim(),
      workDays: el.eDays.value.split(",").map((x) => x.trim()).filter(Boolean),
      offPolicy: el.eOff.value.trim(),
      locations: el.eLocations.value.split(",").map((x) => x.trim()).filter(Boolean)
    });

    CRM.write(CRM.K.employees, employees);
    el.employeeForm.reset();
    refreshAll();
    show("Funcionário adicionado com sucesso.", true);
  });

  if (el.prevMonthBtn) {
    el.prevMonthBtn.addEventListener("click", () => {
      currentMonth -= 1;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear -= 1;
      }
      renderCalendar();
    });
  }

  if (el.nextMonthBtn) {
    el.nextMonthBtn.addEventListener("click", () => {
      currentMonth += 1;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear += 1;
      }
      renderCalendar();
    });
  }

  refreshAll();
  window.addEventListener("crm:remote-sync", refreshAll);
  clearShow();
})();
