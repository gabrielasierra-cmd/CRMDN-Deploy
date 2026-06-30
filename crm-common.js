window.CRM = (() => {
  const K = {
    users: "crm_users",
    session: "crm_session",
    clients: "clients",
    cleaningServices: "cleaningServices",
    teams: "teams",
    schedules: "schedules",
    invoices: "invoices",
    payments: "payments",
    expenses: "expenses",
    salaryPayments: "salaryPayments",
    materials: "materials",
    materialMoves: "material_moves",
    materialDistribution: "material_distribution",
    plans: "plans",
    vacations: "vacations",
    employees: "employees",
    extraShifts: "extraShifts",
    serviceRequests: "serviceRequests"
  };

  const RATE = { residencial: 20, comercial: 32, pos_obra: 40 };

  const read = (key, fallback = []) => JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  const write = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
    if (window.CRMDB && typeof window.CRMDB.push === "function") {
      window.CRMDB.push(key, value);
    }
  };
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const money = (n) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);

  function ensureTeams() {
    if (!read(K.teams).length) {
      write(K.teams, [
        { id: uid(), name: "Equipa Norte" },
        { id: uid(), name: "Equipa Centro" },
        { id: uid(), name: "Equipa Sul" }
      ]);
    }
  }

  function servicePrice(type, hours, extras) {
    return +((RATE[type] || 20) * hours + extras.length * 10).toFixed(2);
  }

  function teamConflict(teamId, startISO, hours) {
    const start = new Date(startISO).getTime();
    const end = start + hours * 3600000;
    return read(K.cleaningServices).some((s) => {
      if (s.teamId !== teamId || s.status === "cancelado") return false;
      const sStart = new Date(s.startAt).getTime();
      const sEnd = sStart + s.durationHours * 3600000;
      return start < sEnd && end > sStart;
    });
  }

  function teamOnVacation(teamId, startISO) {
    const date = startISO.slice(0, 10);
    return read(K.vacations).some((v) => v.teamId === teamId && v.date === date);
  }

  function getMap(key) {
    return Object.fromEntries(read(key).map((x) => [x.id, x]));
  }

  function ensureEmployees() {
    const defaults = [
      {
        id: uid(),
        name: "Sonia C.",
        workDays: ["terca", "quarta", "quinta", "sexta", "sabado", "domingo", "segunda"],
        offPolicy: "2 folgas rotativas por semana",
        locations: ["Nortada", "Bellano", "Bar Azul"],
        defaultShift: "08:00-17:00"
      },
      {
        id: uid(),
        name: "Isabel P.",
        workDays: ["sabado", "domingo"],
        offPolicy: "Folga de segunda a sexta",
        locations: ["Bar Wine", "Plastic"],
        defaultShift: "10:00-18:00"
      },
      {
        id: uid(),
        name: "Joao P.",
        workDays: ["segunda", "quinta"],
        offPolicy: "2 vezes por semana",
        locations: ["Escritorio Funeraria"],
        defaultShift: "09:00-13:00"
      },
      {
        id: uid(),
        name: "Narai S.",
        workDays: ["conforme necessidade"],
        offPolicy: "Reforco nas folgas",
        locations: ["Apoio geral"],
        defaultShift: "Reforco"
      },
      {
        id: uid(),
        name: "Dalila S.",
        workDays: ["sabado"],
        offPolicy: "Turno parcial",
        locations: ["Academia"],
        defaultShift: "3h"
      },
      {
        id: uid(),
        name: "Julian F.",
        workDays: ["sabado"],
        offPolicy: "Cobre folgas de Sonia",
        locations: ["Academia"],
        defaultShift: "3h"
      },
      {
        id: uid(),
        name: "Gabriela S.",
        workDays: ["conforme necessidade"],
        offPolicy: "Cobre folgas",
        locations: ["Stock", "Sistemas"],
        defaultShift: "Operacional"
      },
      {
        id: uid(),
        name: "Loushiana S.",
        workDays: ["segunda", "terca", "quarta", "quinta", "sexta"],
        offPolicy: "Administrativa e gestao",
        locations: ["Administracao", "Gestao"],
        defaultShift: "09:00-18:00"
      },
      {
        id: uid(),
        name: "Jeny S.",
        workDays: ["conforme necessidade"],
        offPolicy: "Cobre folgas de Sonia",
        locations: ["Apoio geral"],
        defaultShift: "Reforco"
      },
      {
        id: uid(),
        name: "Angie S.",
        workDays: ["conforme necessidade"],
        offPolicy: "Apoio operacional",
        locations: ["Apoio geral"],
        defaultShift: "Reforco"
      },
      {
        id: uid(),
        name: "Jairo J.",
        workDays: ["conforme necessidade"],
        offPolicy: "Apoio operacional",
        locations: ["Apoio geral"],
        defaultShift: "Reforco"
      },
      {
        id: uid(),
        name: "Samuel D.",
        workDays: ["conforme necessidade"],
        offPolicy: "Apoio operacional",
        locations: ["Apoio geral"],
        defaultShift: "Reforco"
      },
      {
        id: uid(),
        name: "Paola D.",
        workDays: ["conforme necessidade"],
        offPolicy: "Apoio operacional",
        locations: ["Apoio geral"],
        defaultShift: "Reforco"
      },
      {
        id: uid(),
        name: "Patricia S.",
        workDays: ["conforme necessidade"],
        offPolicy: "Apoio operacional",
        locations: ["Apoio geral"],
        defaultShift: "Reforco"
      },
      {
        id: uid(),
        name: "Rita",
        workDays: ["conforme necessidade"],
        offPolicy: "Apoio operacional",
        locations: ["Apoio geral"],
        defaultShift: "Reforco"
      }
    ];

    const current = read(K.employees);
    if (!current.length) {
      write(K.employees, defaults);
      return;
    }

    const names = new Set(current.map((e) => String(e.name || "").trim().toLowerCase()));
    const missing = defaults.filter((d) => !names.has(d.name.toLowerCase()));
    if (missing.length) write(K.employees, [...current, ...missing]);
  }

  function ensureBaseClients() {
    const defaults = [
      { name: "Bellano", contact: "-", address: "Restaurante", serviceType: "comercial", frequency: "semanal", notes: "Limpeza diaria durante a manha." },
      { name: "Nortada", contact: "-", address: "Restaurante", serviceType: "comercial", frequency: "semanal", notes: "Limpeza diaria durante a manha." },
      { name: "Tokotai", contact: "-", address: "Restaurante", serviceType: "comercial", frequency: "semanal", notes: "Limpeza diaria durante a manha." },
      { name: "Bar Azul", contact: "-", address: "Wine bar", serviceType: "comercial", frequency: "semanal", notes: "Bar de vinhos." },
      { name: "Lavanderia Bar", contact: "-", address: "Lavandaria", serviceType: "comercial", frequency: "semanal", notes: "Servico de lavandaria para bar." },
      { name: "Bar Stellar", contact: "-", address: "Wine bar", serviceType: "comercial", frequency: "semanal", notes: "Bar de vinhos." },
      { name: "Plasctic", contact: "-", address: "Discoteca", serviceType: "comercial", frequency: "semanal", notes: "Servicos aos sabados e domingos." },
      { name: "ABF", contact: "-", address: "Ginasio", serviceType: "comercial", frequency: "semanal", notes: "Sabados durante 3 horas." },
      { name: "Casa Semanal 1", contact: "-", address: "Casa", serviceType: "residencial", frequency: "semanal", notes: "Limpeza semanal." },
      { name: "Casa Semanal 2", contact: "-", address: "Casa", serviceType: "residencial", frequency: "semanal", notes: "Limpeza semanal." },
      { name: "Casa Quinzenal", contact: "-", address: "Casa", serviceType: "residencial", frequency: "quinzenal", notes: "Limpeza duas vezes por mes." },
      { name: "Escritorio Nortada", contact: "-", address: "Escritorio", serviceType: "comercial", frequency: "semanal", notes: "Frequencia variada." },
      { name: "Escritorio Ramalde", contact: "-", address: "Escritorio", serviceType: "comercial", frequency: "quinzenal", notes: "Frequencia variada." },
      { name: "Escritorio Sao Mamade", contact: "-", address: "Escritorio", serviceType: "comercial", frequency: "mensal", notes: "Frequencia variada." },
      { name: "Escritorio Porto", contact: "-", address: "Escritorio", serviceType: "comercial", frequency: "mensal", notes: "Frequencia variada." },
      { name: "Patio Exterior", contact: "-", address: "Exterior", serviceType: "comercial", frequency: "semanal", notes: "Uma vez por semana." }
    ];

    const current = read(K.clients, []);
    const byName = new Set(current.map((c) => String(c.name || "").trim().toLowerCase()));
    let changed = false;
    const merged = [...current];

    defaults.forEach((d) => {
      const key = d.name.toLowerCase();
      if (byName.has(key)) return;
      merged.push({ id: uid(), ...d });
      byName.add(key);
      changed = true;
    });

    if (!current.length || changed) write(K.clients, merged);
    return merged.length;
  }

  function seedDemo() {
    if (!read(K.clients).length) {
      write(K.clients, [
        { id: uid(), name: "Condominio Atlantico", contact: "913000111", address: "Rua do Mar 14, Porto", serviceType: "comercial", frequency: "semanal" },
        { id: uid(), name: "Casa Silva", contact: "917222999", address: "Av Central 99, Braga", serviceType: "residencial", frequency: "quinzenal" }
      ]);
    }
    const clients = read(K.clients);
    const teams = read(K.teams);
    if (!read(K.cleaningServices).length && clients.length && teams.length) {
      const d = new Date(Date.now() + 86400000);
      d.setHours(9, 0, 0, 0);
      write(K.cleaningServices, [{
        id: uid(),
        clientId: clients[0].id,
        teamId: teams[0].id,
        startAt: d.toISOString().slice(0, 16),
        durationHours: 3,
        type: "comercial",
        priority: "media",
        extras: ["Janelas"],
        price: servicePrice("comercial", 3, ["Janelas"]),
        status: "agendado"
      }]);
    }
  }

  if (window.CRMDB && typeof window.CRMDB.init === "function") {
    window.CRMDB.init().then((ok) => {
      if (!ok) return;
      const ignoredKeys = new Set([K.session, K.materials, K.materialMoves, K.materialDistribution]);
      const keys = Object.values(K).filter((k) => !ignoredKeys.has(k));
      window.CRMDB.pull(keys).then(() => {
        if (typeof window.CRMDB.hydrateMissingFromLocal === "function") {
          window.CRMDB.hydrateMissingFromLocal(keys);
        }
        if (typeof window.CRMDB.mirrorLocal === "function") {
          window.CRMDB.mirrorLocal(keys);
        }
      });
      window.CRMDB.start(keys, 30000);
    });
  }

  return {
    K, RATE, read, write, uid, money,
    ensureTeams, ensureEmployees, ensureBaseClients, servicePrice, teamConflict, teamOnVacation, getMap, seedDemo
  };
})();
