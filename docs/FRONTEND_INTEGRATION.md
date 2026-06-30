# Frontend Integration (Vanilla JS)

## API client base
Criar ficheiro `api-client.js` no frontend:

```js
const API_BASE = "http://localhost:4000/api";

let accessToken = null;
let csrfToken = null;

export function setSession(session) {
  accessToken = session.accessToken ?? null;
  csrfToken = session.csrfToken ?? null;
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes((options.method || "GET").toUpperCase())) {
    headers["x-csrf-token"] = csrfToken;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  if (response.status === 401 && path !== "/auth/refresh") {
    const refreshed = await refreshSession();
    if (refreshed) {
      return request(path, options);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Request failed");
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function login(email, password) {
  const data = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  setSession(data);
  return data;
}

export async function register(payload) {
  const data = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  setSession(data);
  return data;
}

export async function refreshSession() {
  try {
    const data = await request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({})
    });
    setSession(data);
    return true;
  } catch (_error) {
    setSession({});
    return false;
  }
}

export async function listClients(page = 1, pageSize = 20) {
  return request(`/clients?page=${page}&pageSize=${pageSize}`);
}
```
