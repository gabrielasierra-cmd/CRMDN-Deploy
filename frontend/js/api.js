window.CRMApi = (() => {
  const DEFAULT_BASE_URL = "http://localhost:4000/api";
  const AUTH_STORAGE_KEY = "crm_api_auth";

  let authState = loadAuthState();

  function loadAuthState() {
    try {
      const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function saveAuthState(nextState) {
    authState = nextState || null;
    if (!nextState) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextState));
  }

  function getBaseUrl() {
    const configured = window.CRM_API_BASE_URL;
    if (configured && typeof configured === "string") return configured.replace(/\/$/, "");

    if (window.location && window.location.origin && /^https?:/i.test(window.location.protocol)) {
      const hostname = String(window.location.hostname || "").toLowerCase();
      const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(hostname);
      if (!isLocalhost || String(window.location.port || "") === "4000") {
        return `${window.location.origin.replace(/\/$/, "")}/api`;
      }
    }

    return DEFAULT_BASE_URL;
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function buildUrl(path, query) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${getBaseUrl()}${normalizedPath}`);
    if (query && typeof query === "object") {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        url.searchParams.set(key, String(value));
      });
    }
    return url.toString();
  }

  async function parseResponse(response) {
    if (response.status === 204) return null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  function errorMessageFromPayload(payload, fallback) {
    if (!payload) return fallback;
    if (typeof payload === "string") return payload;
    if (payload.error) return payload.error;
    return fallback;
  }

  async function refreshSession() {
    const csrfToken = (authState && authState.csrfToken) || getCookie("csrf_token");
    if (!csrfToken) {
      clearAuth();
      return null;
    }

    const response = await fetch(buildUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: "{}"
    });

    const payload = await parseResponse(response);
    if (!response.ok) {
      clearAuth();
      return null;
    }

    saveAuthState({
      ...(authState || {}),
      accessToken: payload.accessToken,
      accessTokenExpiresIn: payload.accessTokenExpiresIn,
      organizationId: payload.organizationId,
      role: payload.role,
      csrfToken: payload.csrfToken || csrfToken,
      updatedAt: new Date().toISOString()
    });

    return getAuth();
  }

  async function request(path, options = {}) {
    const {
      method = "GET",
      body,
      query,
      auth = true,
      csrf = false,
      retryOnUnauthorized = true
    } = options;

    const headers = { ...(options.headers || {}) };
    let shouldSendBody = body !== undefined && body !== null;

    if (shouldSendBody) {
      headers["Content-Type"] = "application/json";
    }

    if (auth && authState && authState.accessToken) {
      headers.Authorization = `Bearer ${authState.accessToken}`;
    }

    if (csrf) {
      const csrfToken = (authState && authState.csrfToken) || getCookie("csrf_token");
      if (csrfToken) headers["x-csrf-token"] = csrfToken;
    }

    let response;
    try {
      response = await fetch(buildUrl(path, query), {
        method,
        credentials: "include",
        headers,
        body: shouldSendBody ? JSON.stringify(body) : undefined
      });
    } catch (_networkError) {
      const err = new Error("Nao foi possivel ligar ao servidor. Tente novamente em instantes.");
      err.status = 0;
      throw err;
    }

    if (response.status === 401 && auth && retryOnUnauthorized) {
      const refreshed = await refreshSession();
      if (refreshed && refreshed.accessToken) {
        return request(path, { ...options, retryOnUnauthorized: false });
      }
    }

    const payload = await parseResponse(response);
    if (!response.ok) {
      const err = new Error(errorMessageFromPayload(payload, `HTTP ${response.status}`));
      err.status = response.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  }

  async function requestBlob(path, options = {}) {
    const {
      method = "GET",
      body,
      query,
      auth = true
    } = options;

    const headers = { ...(options.headers || {}) };
    const shouldSendBody = body !== undefined && body !== null;

    if (auth && authState && authState.accessToken) {
      headers.Authorization = `Bearer ${authState.accessToken}`;
    }

    let response;
    try {
      response = await fetch(buildUrl(path, query), {
        method,
        credentials: "include",
        headers,
        body: shouldSendBody ? body : undefined
      });
    } catch (_networkError) {
      const err = new Error("Nao foi possivel ligar ao servidor. Tente novamente em instantes.");
      err.status = 0;
      throw err;
    }

    if (response.status === 401 && auth && authState && authState.accessToken) {
      const refreshed = await refreshSession();
      if (refreshed && refreshed.accessToken) {
        return requestBlob(path, { ...options, auth: true });
      }
    }

    if (!response.ok) {
      const payload = await parseResponse(response);
      const err = new Error(errorMessageFromPayload(payload, `HTTP ${response.status}`));
      err.status = response.status;
      err.payload = payload;
      throw err;
    }

    return response.blob();
  }

  async function requestBinary(path, options = {}) {
    const {
      method = "POST",
      body,
      query,
      auth = true
    } = options;

    const headers = { ...(options.headers || {}) };
    if (auth && authState && authState.accessToken) {
      headers.Authorization = `Bearer ${authState.accessToken}`;
    }

    let response;
    try {
      response = await fetch(buildUrl(path, query), {
        method,
        credentials: "include",
        headers,
        body
      });
    } catch (_networkError) {
      const err = new Error("Nao foi possivel ligar ao servidor. Tente novamente em instantes.");
      err.status = 0;
      throw err;
    }

    if (response.status === 401 && auth && authState && authState.accessToken) {
      const refreshed = await refreshSession();
      if (refreshed && refreshed.accessToken) {
        return requestBinary(path, { ...options, auth: true });
      }
    }

    const payload = await parseResponse(response);
    if (!response.ok) {
      const err = new Error(errorMessageFromPayload(payload, `HTTP ${response.status}`));
      err.status = response.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  }

  function getAuth() {
    return authState ? { ...authState } : null;
  }

  function setAuth(nextState) {
    saveAuthState(nextState ? { ...nextState } : null);
  }

  function clearAuth() {
    saveAuthState(null);
  }

  async function login(input) {
    const payload = await request("/auth/login", { method: "POST", body: input, auth: false });
    saveAuthState({
      accessToken: payload.accessToken,
      accessTokenExpiresIn: payload.accessTokenExpiresIn,
      organizationId: payload.organizationId,
      role: payload.role,
      user: payload.user,
      csrfToken: payload.csrfToken,
      updatedAt: new Date().toISOString()
    });
    return payload;
  }

  async function register(input) {
    const payload = await request("/auth/register", { method: "POST", body: input, auth: false });
    saveAuthState({
      accessToken: payload.accessToken,
      accessTokenExpiresIn: payload.accessTokenExpiresIn,
      organizationId: payload.organizationId,
      role: payload.role,
      user: payload.user,
      csrfToken: payload.csrfToken,
      updatedAt: new Date().toISOString()
    });
    return payload;
  }

  async function logout() {
    try {
      await request("/auth/logout", { method: "POST", csrf: true, auth: true });
    } finally {
      clearAuth();
    }
  }

  function listQuery(page = 1, pageSize = 100) {
    return { page, pageSize };
  }

  return {
    request,
    getAuth,
    setAuth,
    clearAuth,
    refreshSession,
    login,
    register,
    logout,

    getClients: (params = {}) => request("/clients", { query: { ...listQuery(params.page, params.pageSize), ...params } }),
    createClient: (data) => request("/clients", { method: "POST", body: data }),
    updateClient: (clientId, data) => request(`/clients/${clientId}`, { method: "PUT", body: data }),

    getServices: (params = {}) => request("/services", { query: { ...listQuery(params.page, params.pageSize), ...params } }),
    createService: (data) => request("/services", { method: "POST", body: data }),

    getOrders: (params = {}) => request("/orders", { query: { ...listQuery(params.page, params.pageSize), ...params } }),
    createOrder: (data) => request("/orders", { method: "POST", body: data }),

    getEmployees: (params = {}) => request("/employees", { query: { ...listQuery(params.page, params.pageSize), ...params } }),
    getSalaries: (params = {}) => request("/salaries", { query: { ...listQuery(params.page, params.pageSize), ...params } }),

    getPayments: (params = {}) => request("/payments", { query: { ...listQuery(params.page, params.pageSize), ...params } }),
    createPayment: (data) => request("/payments", { method: "POST", body: data }),
    updatePayment: (paymentId, data) => request(`/payments/${paymentId}`, { method: "PUT", body: data }),
    deletePayment: (paymentId) => request(`/payments/${paymentId}`, { method: "DELETE" }),

    getWorkHours: (params = {}) => request("/work-hours", { query: { ...listQuery(params.page, params.pageSize), ...params } }),
    getWorkHoursStats: (params = {}) => request("/work-hours/stats", { query: params }),
    createWorkHour: (data) => request("/work-hours", { method: "POST", body: data }),
    updateWorkHour: (recordId, data) => request(`/work-hours/${recordId}`, { method: "PUT", body: data }),
    deleteWorkHour: (recordId) => request(`/work-hours/${recordId}`, { method: "DELETE" }),

    getMaterials: (params = {}) => request("/materials", { query: { ...listQuery(params.page, params.pageSize), ...params } }),
    createMaterial: (data) => request("/materials", { method: "POST", body: data }),
    createStockMovement: (data) => request("/stock/movement", { method: "POST", body: data }),
    getStockHistory: (params = {}) => request("/stock/history", { query: { ...listQuery(params.page, params.pageSize), ...params } }),

    getFinancialSummary: () => request("/financial/summary"),
    getFinancialDashboard: (params = {}) => request("/financial/dashboard", { query: params }),
    getFinancialHistory: (params = {}) => request("/financial/history", { query: params }),
    getFinancialExpenses: (params = {}) => request("/financial/expenses", { query: params }),
    createFinancialExpense: (data) => request("/financial/expenses", { method: "POST", body: data }),
    deleteFinancialExpense: (expenseId) => request(`/financial/expenses/${expenseId}`, { method: "DELETE" }),
    updateFinancialSettings: (data) => request("/financial/settings", { method: "PATCH", body: data }),
    reverseFinancialAllocation: (paymentId, data = {}) =>
      request(`/financial/reverse/${paymentId}`, { method: "POST", body: data }),

    listVideoQuotes: (params = {}) => request("/video-quotes", { query: { ...listQuery(params.page, params.pageSize), ...params } }),
    getVideoQuote: (quoteId) => request(`/video-quotes/${quoteId}`),
    analyzeVideoQuote: (file, params = {}) => {
      const query = {};
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        query[key] = value;
      });

      const headers = {
        "Content-Type": file.type || "application/octet-stream",
        "x-file-name": file.name || "video.mp4"
      };

      return requestBinary("/video-quotes/analyze", {
        method: "POST",
        query,
        body: file,
        headers
      });
    },
    approveVideoQuote: (quoteId, data = {}) => request(`/video-quotes/${quoteId}/approve`, { method: "POST", body: data }),
    downloadVideoQuoteDocument: async (quoteId, kind) => {
      const blob = await requestBlob(`/video-quotes/${quoteId}/document/${kind}`);
      return blob;
    }
  };
})();
