const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

async function request(path, { method = "POST", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

export async function register(username, password) {
  return request("/api/users/register", { body: { username, password } });
}

export async function login(username, password) {
  return request("/api/users/login", { body: { username, password } });
}

export async function generateApiKey(token) {
  return request("/api/users/generateapikey", { token });
}
