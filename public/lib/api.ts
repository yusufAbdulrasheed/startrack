// Same-origin by default: in production the API serves this very page, and in
// development Vite proxies /api to it. VITE_API_URL is only needed if the
// client is ever deployed apart from the server again.
const BASE = (import.meta.env.VITE_API_URL as string) || "/api";
const TOKEN_KEY = "startrack.token";

let token: string | null = localStorage.getItem(TOKEN_KEY);
let businessId: string | null = null;
let branchId: string | null = null;

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getToken() {
  return token;
}

// The active business/branch ride on every request as headers. The server
// validates them against the caller's membership — they're context, not authority.
export function setTenant(biz: string | null, branch: string | null) {
  businessId = biz;
  branchId = branch;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(businessId ? { "x-business-id": businessId } : {}),
        ...(branchId ? { "x-branch-id": branchId } : {}),
        ...(opts.headers || {}),
      },
    });
  } catch {
    throw new ApiError("Can't reach the server. Is the API running?", 0, "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.message || data.error || "Something went wrong", res.status, data.error);
  }
  return data as T;
}
